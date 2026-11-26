import { unwrapCommand } from './parser.js';
import type { RuleContext, RuleDefinition, RuleMatch } from './types.js';

const UNIX_ONLY_COMMANDS = new Set([
  'rm',
  'cp',
  'mv',
  'touch',
  'ln',
  'chmod',
  'chown',
  'cat',
  'head',
  'tail',
  'grep',
  'sed',
  'awk',
  'find',
  'xargs',
  'which',
  'export',
  'unset',
  'pwd',
  'ls',
  'sleep',
  'kill',
  'pkill',
  'uname',
  'basename',
  'dirname',
  'readlink',
  'realpath',
  'tee',
  'wc',
  'sort',
  'uniq',
  'tr',
  'cut',
  'diff',
  'tar',
]);

const WINDOWS_ONLY_COMMANDS = new Set([
  'set',
  'del',
  'erase',
  'rmdir',
  'rd',
  'xcopy',
  'robocopy',
  'copy',
  'move',
  'type',
  'dir',
  'cls',
  'where',
  'cmd',
  'powershell',
  'pwsh',
]);

export const RULES: readonly RuleDefinition[] = [
  {
    id: 'PC001',
    slug: 'unix-env-assignment',
    title: 'Unix-style inline environment variable assignment',
    category: 'env',
    severity: 'error',
    heuristic: false,
    explanation:
      'Inline environment variable assignments like `NODE_ENV=production cmd` work in POSIX shells (macOS/Linux) but fail in Windows `cmd.exe` and PowerShell.',
    suggestion:
      'Use `cross-env` (e.g., `cross-env NODE_ENV=production node app.js`) or read/set configuration inside a Node.js script.',
    check(_scriptName: string, _scriptValue: string, context: RuleContext): RuleMatch[] {
      const matches: RuleMatch[] = [];
      for (const seg of context.segments) {
        if (seg.envAssignments.length > 0 && seg.command !== undefined) {
          matches.push({
            matched: seg.envAssignments.join(' '),
            offset: seg.offset,
          });
        }
      }
      return matches;
    },
  },
  {
    id: 'PC002',
    slug: 'unix-only-command',
    title: 'Unix-specific shell command',
    category: 'command',
    severity: 'error',
    heuristic: false,
    explanation:
      'Commands such as `rm`, `cp`, `mv`, `touch`, `mkdir -p`, `export`, `chmod`, `cat`, and `which` are not available or behave differently in Windows `cmd.exe` and PowerShell.',
    suggestion:
      'Replace with cross-platform Node packages (`rimraf` for `rm`, `shx` or `cpx2` for `cp`/`mv`/`mkdir`, `cross-env` for `export`) or a small `node -e` / `.mjs` script.',
    check(_scriptName: string, _scriptValue: string, context: RuleContext): RuleMatch[] {
      const matches: RuleMatch[] = [];
      for (const seg of context.segments) {
        const { command, args } = unwrapCommand(seg);
        if (!command) continue;

        if (command === 'shx') {
          // `shx` itself is cross-platform
          continue;
        }

        if (UNIX_ONLY_COMMANDS.has(command)) {
          matches.push({
            matched: command,
            offset: seg.offset,
          });
        } else if (command === 'mkdir' && args.some((a) => a === '-p' || a === '--parents')) {
          matches.push({
            matched: 'mkdir -p',
            offset: seg.offset,
          });
        }
      }
      return matches;
    },
  },
  {
    id: 'PC003',
    slug: 'windows-only-command',
    title: 'Windows-specific shell command or syntax',
    category: 'command',
    severity: 'error',
    heuristic: false,
    explanation:
      'Windows-specific commands (`SET`, `del`, `rmdir /s`, `xcopy`, `robocopy`, `where`, `powershell`, `$env:VAR`) fail on macOS and Linux.',
    suggestion: 'Use cross-platform Node tools (`cross-env`, `rimraf`, `shx`) or a Node.js script.',
    check(_scriptName: string, scriptValue: string, context: RuleContext): RuleMatch[] {
      const matches: RuleMatch[] = [];
      for (const seg of context.segments) {
        const { command } = unwrapCommand(seg);
        if (command) {
          const lower = command.toLowerCase();
          if (WINDOWS_ONLY_COMMANDS.has(lower)) {
            matches.push({
              matched: command,
              offset: seg.offset,
            });
          }
        }
      }
      const psEnvRe = /\$env:[A-Za-z_][A-Za-z0-9_]*/g;
      let m: RegExpExecArray | null;
      while ((m = psEnvRe.exec(scriptValue)) !== null) {
        matches.push({
          matched: m[0],
          offset: m.index,
        });
      }
      return matches;
    },
  },
  {
    id: 'PC004',
    slug: 'shell-background-operator',
    title: 'Background execution with single `&` operator',
    category: 'shell',
    severity: 'error',
    heuristic: true,
    explanation:
      'A single `&` runs a command in the background on POSIX shells, whereas Windows `cmd.exe` runs commands sequentially and PowerShell rejects `&` as a background operator.',
    suggestion:
      'Use `concurrently` or `npm-run-all2` (`run-p`) to run multiple tasks in parallel across all platforms.',
    check(_scriptName: string, _scriptValue: string, context: RuleContext): RuleMatch[] {
      const matches: RuleMatch[] = [];
      for (const seg of context.segments) {
        if (seg.trailingOperator === '&') {
          matches.push({
            matched: `${seg.raw} &`,
            offset: seg.offset,
          });
        }
      }
      return matches;
    },
  },
  {
    id: 'PC005',
    slug: 'platform-env-expansion',
    title: 'Platform-specific environment variable expansion',
    category: 'env',
    severity: 'warning',
    heuristic: true,
    explanation:
      'Shell variable expansion (`$VAR`, `${VAR}` on POSIX vs `%VAR%` on Windows `cmd.exe`) is not portable across shells.',
    suggestion:
      'Use `cross-env-shell` for cross-platform variable expansion, or read `process.env.VAR` inside a Node.js script.',
    check(_scriptName: string, scriptValue: string, context: RuleContext): RuleMatch[] {
      const matches: RuleMatch[] = [];
      for (const seg of context.segments) {
        if (seg.command === 'cross-env-shell') {
          continue;
        }
        // Skip inline node -e / --eval scripts where $ is likely JS template/regex
        if (seg.command === 'node' && seg.args.some((a) => a === '-e' || a === '--eval')) {
          continue;
        }
        for (const tok of seg.tokens) {
          if (tok.quote === 'single') continue;
          // Match $VAR or ${VAR} but not $(...) and not $env:
          const posixVar = /\$(?:\{[A-Za-z_][A-Za-z0-9_]*\}|[A-Za-z_][A-Za-z0-9_]*)(?!:)/.exec(
            tok.raw,
          );
          if (posixVar && !tok.raw.startsWith('$env:')) {
            matches.push({
              matched: posixVar[0],
              offset: tok.offset + posixVar.index,
            });
          }
          const winVar = /%[A-Za-z_][A-Za-z0-9_]*%/.exec(tok.raw);
          if (winVar) {
            matches.push({
              matched: winVar[0],
              offset: tok.offset + winVar.index,
            });
          }
        }
      }
      // Also catch empty-segment edge case? Covered by tokens above.
      void scriptValue;
      return matches;
    },
  },
  {
    id: 'PC006',
    slug: 'single-quoted-args',
    title: 'Single-quoted argument in script',
    category: 'shell',
    severity: 'warning',
    heuristic: true,
    explanation:
      "Windows `cmd.exe` does not treat single quotes (`'...'`) as quote delimiters and passes them literally to the command, unlike POSIX shells and PowerShell.",
    suggestion:
      'Use escaped double quotes (`"\\"arg\\""`) or move arguments/globs into a configuration file or Node.js script.',
    check(_scriptName: string, _scriptValue: string, context: RuleContext): RuleMatch[] {
      const matches: RuleMatch[] = [];
      for (const seg of context.segments) {
        for (const tok of seg.tokens) {
          if (tok.quote === 'single') {
            matches.push({
              matched: tok.raw,
              offset: tok.offset,
            });
          }
        }
      }
      return matches;
    },
  },
  {
    id: 'PC007',
    slug: 'command-substitution',
    title: 'POSIX command substitution or subshell',
    category: 'shell',
    severity: 'error',
    heuristic: true,
    explanation:
      'Command substitution (`$(...)`, backticks `` `...` ``) and process substitution (`<(...)`) are POSIX shell features that fail in Windows `cmd.exe` and behave differently in PowerShell.',
    suggestion:
      'Compute dynamic values inside a Node.js script (e.g., `node scripts/task.mjs`) using `child_process` or Node APIs.',
    check(_scriptName: string, _scriptValue: string, context: RuleContext): RuleMatch[] {
      const matches: RuleMatch[] = [];
      for (const seg of context.segments) {
        if (seg.command === 'node' && seg.args.some((a) => a === '-e' || a === '--eval')) {
          continue;
        }
        // Check segment text outside single-quoted tokens
        const unquotedText = seg.tokens
          .filter((t) => t.quote !== 'single')
          .map((t) => t.raw)
          .join(' ');
        const cmdSub = /\$\([^)]+\)|<\([^)]+\)|`[^`]+`/.exec(unquotedText);
        if (cmdSub) {
          matches.push({
            matched: cmdSub[0],
            offset: seg.offset + cmdSub.index,
          });
        }
      }
      return matches;
    },
  },
  {
    id: 'PC008',
    slug: 'bashism-syntax',
    title: 'Bash-specific syntax not portable to `/bin/sh` or Windows',
    category: 'shell',
    severity: 'warning',
    heuristic: true,
    explanation:
      'Constructs like `[[ ... ]]`, `source`, `<<<` (here-strings), `&>`, `|&`, and brace expansion `{a,b}` are Bash extensions that may fail on Debian/Ubuntu `/bin/sh` (`dash`), Alpine `ash`, and Windows.',
    suggestion:
      'Replace Bash-specific syntax with POSIX-compatible expressions or a cross-platform Node.js script.',
    check(_scriptName: string, _scriptValue: string, context: RuleContext): RuleMatch[] {
      const matches: RuleMatch[] = [];
      for (const seg of context.segments) {
        if (seg.command === 'node' && seg.args.some((a) => a === '-e' || a === '--eval')) {
          continue;
        }
        if (seg.command === 'source' || seg.command === '[[') {
          matches.push({
            matched: seg.command,
            offset: seg.offset,
          });
        }
        for (const tok of seg.tokens) {
          if (tok.quote !== 'none') continue;
          if (/<<<|&>|\|&/.test(tok.raw)) {
            matches.push({
              matched: tok.raw,
              offset: tok.offset,
            });
          } else if (/\{[A-Za-z0-9_.*-]+,[A-Za-z0-9_.*,-]+\}/.test(tok.raw)) {
            matches.push({
              matched: tok.raw,
              offset: tok.offset,
            });
          }
        }
      }
      return matches;
    },
  },
  {
    id: 'PC009',
    slug: 'platform-specific-path',
    title: 'Platform-specific path separator or system path',
    category: 'path',
    severity: 'warning',
    heuristic: true,
    explanation:
      'Backslash path separators (`src\\index.ts`), Windows drive letters (`C:\\...`), or POSIX-only paths (`/dev/null`, `/tmp/...`, `/usr/...`, `~/...`) can fail or resolve differently across operating systems.',
    suggestion:
      'Use forward slashes `/` for relative project paths, or resolve paths dynamically with `node:path` and `node:os` inside a Node.js script.',
    check(_scriptName: string, _scriptValue: string, context: RuleContext): RuleMatch[] {
      const matches: RuleMatch[] = [];
      for (const seg of context.segments) {
        if (seg.command === 'node' && seg.args.some((a) => a === '-e' || a === '--eval')) {
          continue;
        }
        for (const tok of seg.tokens) {
          const val = tok.value;
          const raw = tok.raw.replace(/^['"]|['"]$/g, '');
          // Ignore URLs
          if (/^https?:\/\//i.test(val)) continue;

          if (/^[A-Za-z]:\\/.test(raw) || /(?:^|\.|[\w.-])\\[^\s]+/.test(raw)) {
            matches.push({
              matched: tok.raw,
              offset: tok.offset,
            });
          } else if (
            val === '/dev/null' ||
            /^\/(?:tmp|usr|etc|var|opt|bin)\//.test(val) ||
            val.startsWith('~/')
          ) {
            matches.push({
              matched: tok.raw,
              offset: tok.offset,
            });
          }
        }
      }
      return matches;
    },
  },
  {
    id: 'PC010',
    slug: 'unquoted-glob-pattern',
    title: 'Unquoted glob pattern with shell-dependent expansion',
    category: 'shell',
    severity: 'info',
    heuristic: true,
    explanation:
      'Unquoted globs like `src/**/*.ts` are expanded by POSIX shells before the command runs, whereas Windows `cmd.exe` passes the literal glob string to the command.',
    suggestion:
      'Pass globs in escaped double quotes (`"\\"src/**/*.ts\\""`) when using tools that support built-in glob expansion, or configure file patterns in the tool config.',
    check(_scriptName: string, _scriptValue: string, context: RuleContext): RuleMatch[] {
      const matches: RuleMatch[] = [];
      for (const seg of context.segments) {
        if (seg.command === 'node' && seg.args.some((a) => a === '-e' || a === '--eval')) {
          continue;
        }
        for (const tok of seg.tokens.slice(1)) {
          if (tok.quote === 'none' && /[*?]/.test(tok.raw) && !tok.raw.startsWith('-')) {
            matches.push({
              matched: tok.raw,
              offset: tok.offset,
            });
          }
        }
      }
      return matches;
    },
  },
  {
    id: 'PC011',
    slug: 'unsafe-script-pattern',
    title: 'Potentially unsafe or privileged script pattern (heuristic)',
    category: 'safety',
    severity: 'warning',
    heuristic: true,
    explanation:
      'Piping remote downloads to a shell (`curl ... | sh`), using `eval`, `sudo`, or destructive root/home deletions (`rm -rf /`, `rm -rf ~`) is both non-portable and a security/safety risk.',
    suggestion:
      'Avoid remote shell piping, `eval`, and `sudo` in `package.json` scripts; use pinned npm packages and explicit Node.js scripts instead.',
    check(_scriptName: string, scriptValue: string, context: RuleContext): RuleMatch[] {
      const matches: RuleMatch[] = [];
      const pipeToShell = /\b(?:curl|wget)\b[^|]*\|\s*(?:ba|z|da)?sh\b/i.exec(scriptValue);
      if (pipeToShell) {
        matches.push({
          matched: pipeToShell[0],
          offset: pipeToShell.index,
        });
      }

      for (const seg of context.segments) {
        const { command, args } = unwrapCommand(seg);
        if (command === 'sudo' || command === 'eval') {
          matches.push({
            matched: command,
            offset: seg.offset,
          });
        }
        if (command === 'rm' && args.some((a) => a === '/' || a === '~' || a === '/*')) {
          matches.push({
            matched: seg.raw,
            offset: seg.offset,
          });
        }
      }
      return matches;
    },
  },
  {
    id: 'PC012',
    slug: 'semicolon-command-separator',
    title: 'Semicolon `;` command separator',
    category: 'shell',
    severity: 'info',
    heuristic: true,
    explanation:
      'Using `;` to chain commands works in POSIX shells and PowerShell 7+, but fails in Windows `cmd.exe` where `;` is not a command separator.',
    suggestion:
      'Use `&&` to chain commands sequentially (cross-platform), or use `npm-run-all2` (`run-s`).',
    check(_scriptName: string, _scriptValue: string, context: RuleContext): RuleMatch[] {
      const matches: RuleMatch[] = [];
      for (const seg of context.segments) {
        if (seg.trailingOperator === ';') {
          matches.push({
            matched: `${seg.raw};`,
            offset: seg.offset,
          });
        }
      }
      return matches;
    },
  },
];

export const RULE_MAP: ReadonlyMap<string, RuleDefinition> = new Map(
  RULES.map((rule) => [rule.id, rule]),
);
