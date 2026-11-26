import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analyzeScripts, RULE_MAP, RULES } from '../src/index.js';

function ruleIdsFor(script: string): string[] {
  const result = analyzeScripts({ test: script });
  return result.diagnostics.map((d) => d.ruleId);
}

describe('Rule Registry', () => {
  it('has unique rule IDs and slugs', () => {
    const ids = new Set<string>();
    const slugs = new Set<string>();
    for (const rule of RULES) {
      assert.ok(!ids.has(rule.id), `Duplicate rule id: ${rule.id}`);
      assert.ok(!slugs.has(rule.slug), `Duplicate rule slug: ${rule.slug}`);
      ids.add(rule.id);
      slugs.add(rule.slug);
      assert.equal(RULE_MAP.get(rule.id), rule);
    }
    assert.ok(RULES.length >= 12);
  });
});

describe('PC001 unix-env-assignment', () => {
  it('flags inline env assignments before a command', () => {
    assert.ok(ruleIdsFor('NODE_ENV=production node app.js').includes('PC001'));
    assert.ok(ruleIdsFor('FOO=1 BAR=2 vitest run').includes('PC001'));
  });

  it('does not flag cross-env or plain commands', () => {
    assert.ok(!ruleIdsFor('cross-env NODE_ENV=production node app.js').includes('PC001'));
    assert.ok(!ruleIdsFor('node app.js --env=production').includes('PC001'));
  });
});

describe('PC002 unix-only-command', () => {
  it('flags Unix-only commands and mkdir -p', () => {
    assert.ok(ruleIdsFor('rm -rf dist').includes('PC002'));
    assert.ok(ruleIdsFor('cp -r src dist').includes('PC002'));
    assert.ok(ruleIdsFor('touch .ready').includes('PC002'));
    assert.ok(ruleIdsFor('export FOO=bar && node app.js').includes('PC002'));
    assert.ok(ruleIdsFor('mkdir -p dist/assets').includes('PC002'));
  });

  it('does not flag shx, rimraf, or plain mkdir', () => {
    assert.ok(!ruleIdsFor('rimraf dist').includes('PC002'));
    assert.ok(!ruleIdsFor('shx rm -rf dist').includes('PC002'));
    assert.ok(!ruleIdsFor('shx cp -r src dist').includes('PC002'));
    assert.ok(!ruleIdsFor('mkdir dist').includes('PC002'));
  });
});

describe('PC003 windows-only-command', () => {
  it('flags Windows-only commands and PowerShell $env:', () => {
    assert.ok(ruleIdsFor('SET NODE_ENV=production && node app.js').includes('PC003'));
    assert.ok(ruleIdsFor('del /q dist\\app.js').includes('PC003'));
    assert.ok(ruleIdsFor('powershell -Command "echo hi"').includes('PC003'));
    assert.ok(ruleIdsFor('node -e "console.log(1)" && echo $env:PATH').includes('PC003'));
  });

  it('does not flag cross-env or standard node commands', () => {
    assert.ok(!ruleIdsFor('cross-env NODE_ENV=production node app.js').includes('PC003'));
    assert.ok(!ruleIdsFor('vitest run').includes('PC003'));
  });
});

describe('PC004 shell-background-operator', () => {
  it('flags single & background operator', () => {
    assert.ok(ruleIdsFor('node server.js & node worker.js').includes('PC004'));
  });

  it('does not flag && or redirections like 2>&1', () => {
    assert.ok(!ruleIdsFor('npm run lint && npm test').includes('PC004'));
    assert.ok(!ruleIdsFor('node app.js 2>&1').includes('PC004'));
  });
});

describe('PC005 platform-env-expansion', () => {
  it('flags $VAR, ${VAR}, and %VAR%', () => {
    assert.ok(ruleIdsFor('echo $HOME').includes('PC005'));
    assert.ok(ruleIdsFor('echo ${PORT}').includes('PC005'));
    assert.ok(ruleIdsFor('echo %APPDATA%').includes('PC005'));
  });

  it('does not flag cross-env-shell or node -e', () => {
    assert.ok(!ruleIdsFor('cross-env-shell "echo $PORT"').includes('PC005'));
    assert.ok(!ruleIdsFor('node -e "console.log(`${1}`)"').includes('PC005'));
  });
});

describe('PC006 single-quoted-args', () => {
  it('flags single-quoted arguments', () => {
    assert.ok(ruleIdsFor("eslint 'src/**/*.ts'").includes('PC006'));
  });

  it('does not flag double-quoted or unquoted arguments', () => {
    assert.ok(!ruleIdsFor('eslint "src/**/*.ts"').includes('PC006'));
    assert.ok(!ruleIdsFor('eslint src').includes('PC006'));
  });
});

describe('PC007 command-substitution', () => {
  it('flags $(...) and backtick command substitution', () => {
    assert.ok(ruleIdsFor('echo $(git rev-parse --short HEAD)').includes('PC007'));
    assert.ok(ruleIdsFor('echo `date`').includes('PC007'));
  });

  it('does not flag node -e template literals or normal args', () => {
    assert.ok(!ruleIdsFor('node -e "console.log(`ok`)"').includes('PC007'));
    assert.ok(!ruleIdsFor('git rev-parse --short HEAD').includes('PC007'));
  });
});

describe('PC008 bashism-syntax', () => {
  it('flags [[, source, <<<, &>, and brace expansion', () => {
    assert.ok(ruleIdsFor('source .env && node app.js').includes('PC008'));
    assert.ok(ruleIdsFor('[[ -d dist ]] && echo ok').includes('PC008'));
    assert.ok(ruleIdsFor('echo {a,b}.ts').includes('PC008'));
  });

  it('does not flag POSIX commands or quoted strings', () => {
    assert.ok(!ruleIdsFor('node app.js && echo done').includes('PC008'));
  });
});

describe('PC009 platform-specific-path', () => {
  it('flags backslashes, drive letters, /dev/null, and /tmp/', () => {
    assert.ok(ruleIdsFor('node .\\scripts\\build.js').includes('PC009'));
    assert.ok(ruleIdsFor('node C:\\tools\\run.js').includes('PC009'));
    assert.ok(ruleIdsFor('node app.js > /dev/null').includes('PC009'));
    assert.ok(ruleIdsFor('node /tmp/helper.js').includes('PC009'));
  });

  it('does not flag forward-slash relative paths or URLs', () => {
    assert.ok(!ruleIdsFor('node ./scripts/build.js').includes('PC009'));
    assert.ok(!ruleIdsFor('echo https://example.com/a/b').includes('PC009'));
  });
});

describe('PC010 unquoted-glob-pattern', () => {
  it('flags unquoted globs in arguments', () => {
    assert.ok(ruleIdsFor('eslint src/**/*.ts').includes('PC010'));
  });

  it('does not flag quoted globs or flags', () => {
    assert.ok(!ruleIdsFor('eslint "src/**/*.ts"').includes('PC010'));
    assert.ok(!ruleIdsFor('node --help').includes('PC010'));
  });
});

describe('PC011 unsafe-script-pattern', () => {
  it('flags curl|sh, sudo, eval, and rm -rf /', () => {
    assert.ok(ruleIdsFor('curl -fsSL https://example.com/install.sh | sh').includes('PC011'));
    assert.ok(ruleIdsFor('sudo npm run build').includes('PC011'));
    assert.ok(ruleIdsFor('eval "echo hi"').includes('PC011'));
    assert.ok(ruleIdsFor('rm -rf /').includes('PC011'));
  });

  it('does not flag normal npm scripts', () => {
    assert.ok(!ruleIdsFor('tsc -p tsconfig.json').includes('PC011'));
  });
});

describe('PC012 semicolon-command-separator', () => {
  it('flags ; command separator', () => {
    assert.ok(ruleIdsFor('tsc; node dist/index.js').includes('PC012'));
  });

  it('does not flag &&', () => {
    assert.ok(!ruleIdsFor('tsc && node dist/index.js').includes('PC012'));
  });
});
