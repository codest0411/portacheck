import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

const CLI_PATH = path.resolve('bin/portacheck.js');
const FIXTURE_DIR = path.resolve('test/fixtures/sample-project');

function runBin(args: string[]) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: 'utf8',
    timeout: 15_000,
  });
}

describe('CLI integration', () => {
  it('prints help and exits 0', () => {
    const res = runBin(['--help']);
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Usage:/);
    assert.match(res.stdout, /--format/);
  });

  it('prints version and exits 0', () => {
    const res = runBin(['--version']);
    assert.equal(res.status, 0);
    assert.match(res.stdout.trim(), /^\d+\.\d+\.\d+$/);
  });

  it('scans fixture project in text format and exits 1', () => {
    const res = runBin(['--path', FIXTURE_DIR, '--format', 'text']);
    assert.equal(res.status, 1);
    assert.match(res.stdout, /PC001/);
    assert.match(res.stdout, /PC002/);
    assert.match(res.stdout, /Summary:/);
  });

  it('scans fixture project in json format and outputs valid structured JSON', () => {
    const res = runBin(['--path', FIXTURE_DIR, '--format', 'json']);
    assert.equal(res.status, 1);
    const parsed = JSON.parse(res.stdout) as {
      tool: string;
      diagnostics: Array<{ ruleId: string }>;
      summary: { totalFindings: number };
    };
    assert.equal(parsed.tool, 'portacheck');
    assert.ok(parsed.summary.totalFindings > 0);
    assert.ok(parsed.diagnostics.some((d) => d.ruleId === 'PC001'));
  });

  it('exits 0 when --fail-on none is specified', () => {
    const res = runBin(['--path', FIXTURE_DIR, '--fail-on', 'none', '--format', 'json']);
    assert.equal(res.status, 0);
  });

  it('exits 0 on a clean project', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portacheck-clean-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({ name: 'clean-pkg', scripts: { test: 'node --test' } }),
      );
      const res = runBin(['--path', dir]);
      assert.equal(res.status, 0);
      assert.match(res.stdout, /No portability issues found/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits 2 on invalid arguments or missing target directory', () => {
    const badFmt = runBin(['--format', 'xml']);
    assert.equal(badFmt.status, 2);
    assert.match(badFmt.stderr, /Invalid --format/);

    const missing = runBin(['--path', path.join(os.tmpdir(), 'missing-portacheck-dir-12345')]);
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /Error:/);
  });
});
