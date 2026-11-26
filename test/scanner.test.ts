import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  analyzeScripts,
  MAX_DIAGNOSTICS,
  MAX_SCRIPT_LENGTH,
  scanDirectory,
  ScanError,
} from '../src/index.js';

const tempDirs: string[] = [];

function makeTempDir(prefix = 'portacheck-test-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('analyzeScripts', () => {
  it('handles empty scripts and non-string script entries gracefully', () => {
    const res = analyzeScripts({
      empty: '   ',
      invalid: 123 as unknown as string,
      ok: 'tsc --noEmit',
    });
    assert.equal(res.summary.scriptsScanned, 2);
    assert.equal(res.summary.totalFindings, 0);
    assert.equal(res.warnings.length, 1);
    assert.match(res.warnings[0]!, /Skipped non-string script "invalid"/);
  });

  it('bounds huge scripts and caps total diagnostics', () => {
    const longScript = `rm -rf dist && ${'a'.repeat(MAX_SCRIPT_LENGTH + 500)}`;
    const scripts: Record<string, string> = { huge: longScript };
    for (let i = 0; i < MAX_DIAGNOSTICS + 20; i++) {
      scripts[`s${i}`] = 'rm -rf dist';
    }
    const res = analyzeScripts(scripts);
    assert.equal(res.summary.totalFindings, MAX_DIAGNOSTICS);
    assert.equal(res.summary.truncated, true);
    assert.ok(res.warnings.some((w) => w.includes('truncated for analysis')));
  });
});

describe('scanDirectory', () => {
  it('scans a project with spaces and Unicode in the path without executing or modifying files', () => {
    const base = makeTempDir('portacheck spaces üñîçødé-');
    const markerFile = path.join(base, 'should-not-exist.txt');
    const pkgPath = path.join(base, 'package.json');
    const originalPkg = JSON.stringify(
      {
        name: 'unicode-app',
        scripts: {
          danger: `node -e "require('fs').writeFileSync('${markerFile.replace(/\\/g, '\\\\')}', 'pwned')" && touch should-not-exist.txt`,
          greet: 'echo "héllo 🌍"',
        },
      },
      null,
      2,
    );
    fs.writeFileSync(pkgPath, originalPkg, 'utf8');

    const result = scanDirectory(base);
    assert.equal(result.packageName, 'unicode-app');
    assert.equal(result.summary.scriptsScanned, 2);
    assert.ok(result.diagnostics.some((d) => d.ruleId === 'PC002' && d.matched === 'touch'));

    // Prove scripts were NOT executed and package.json was NOT modified
    assert.equal(fs.existsSync(markerFile), false);
    assert.equal(fs.existsSync(path.join(base, 'should-not-exist.txt')), false);
    assert.equal(fs.readFileSync(pkgPath, 'utf8'), originalPkg);
  });

  it('supports .portacheckrc.json suppressions and severity overrides', () => {
    const dir = makeTempDir();
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: 'suppressed-app',
        scripts: {
          build: 'NODE_ENV=production tsc',
          clean: 'rm -rf dist',
          legacy: 'touch a && rm b',
        },
      }),
    );
    fs.writeFileSync(
      path.join(dir, '.portacheckrc.json'),
      JSON.stringify({
        ignoreRules: ['PC001'],
        ignoreScripts: ['legacy'],
        rules: {
          PC002: 'info',
        },
      }),
    );

    const result = scanDirectory(dir);
    assert.equal(result.summary.scriptsScanned, 2);
    assert.equal(result.summary.totalFindings, 1);
    assert.equal(result.diagnostics[0]!.ruleId, 'PC002');
    assert.equal(result.diagnostics[0]!.severity, 'info');
    assert.equal(result.diagnostics[0]!.scriptName, 'clean');
  });

  it('throws ScanError on missing directory, missing package.json, or malformed JSON', () => {
    assert.throws(() => scanDirectory(path.join(os.tmpdir(), 'does-not-exist-99999')), ScanError);

    const emptyDir = makeTempDir();
    assert.throws(() => scanDirectory(emptyDir), ScanError);

    fs.writeFileSync(path.join(emptyDir, 'package.json'), '{ invalid json', 'utf8');
    assert.throws(() => scanDirectory(emptyDir), /Malformed package\.json/);
  });

  it('refuses to follow symlinks pointing outside the scan root', (t) => {
    const outsideDir = makeTempDir('portacheck-outside-');
    const outsidePkg = path.join(outsideDir, 'package.json');
    fs.writeFileSync(
      outsidePkg,
      JSON.stringify({ name: 'outside', scripts: { a: 'rm -rf dist' } }),
    );

    const scanRoot = makeTempDir('portacheck-root-');
    const linkPath = path.join(scanRoot, 'package.json');
    try {
      fs.symlinkSync(outsidePkg, linkPath, 'file');
    } catch (err) {
      // On Windows without Developer Mode / admin privileges, symlink creation may fail with EPERM
      if ((err as NodeJS.ErrnoException).code === 'EPERM') {
        t.skip('Symlink creation requires elevated privileges or Developer Mode on Windows');
        return;
      }
      throw err;
    }

    assert.throws(() => scanDirectory(scanRoot), /symlink outside scan root/);
  });
});
