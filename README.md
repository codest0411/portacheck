# portacheck

Statically analyze `package.json` `scripts` and detect commands, environment syntax, and shell patterns that are likely to fail or behave differently across **Windows**, **macOS**, and **Linux**.

`portacheck` reads `package.json` as plain data—it **never** executes scripts, installs dependencies, modifies files, or sends data over the network.

> **Naming note:** The original working title for this project was `portascript`, which was found to already exist on npm (`portascript@0.1.0`) during pre-implementation research. The package was named `portacheck` (`E404` on npm at creation time) to avoid name collision. See [docs/COMPETITORS.md](docs/COMPETITORS.md) for the full research comparison.

## Why `portacheck`?

Existing ecosystem tools (`cross-env`, `rimraf`, `shx`, `npm-run-all2`) _fix_ portability issues once you know they exist, while `shellcheck` targets standalone `.sh` files rather than `package.json` scripts (where Windows `cmd.exe`, PowerShell, and POSIX `/bin/sh` differences collide).

`portacheck` focuses on **zero-runtime-dependency static analysis** of `package.json` `scripts` with:

- Clear explanations of _why_ a pattern breaks on Windows, macOS, or Linux
- Actionable, safe, portable alternatives (`cross-env`, `rimraf`, `shx`, `concurrently`, `npm-run-all2`, or Node.js scripts)
- Bidirectional checks (both Unix-only patterns that fail on Windows and Windows-only patterns like `SET`, `del`, `$env:` that fail on macOS/Linux)
- Stable JSON output and configurable exit codes for CI pipelines

## Requirements

- **Node.js** `>=20.0.0` (tested on Node 20, 22, and 24)

## Installation

Run without installing globally:

```bash
npx portacheck
```

Or install as a devDependency:

```bash
npm install --save-dev portacheck
```

## Usage

```bash
# Scan package.json in the current directory
portacheck

# Scan a specific project directory
portacheck --path ./packages/web

# Output JSON for CI pipelines
portacheck --format json

# Only fail (exit 1) on error-severity findings
portacheck --fail-on error

# Never fail the exit code on findings (report-only)
portacheck --fail-on none

# Help and version
portacheck --help
portacheck --version
```

### Exit Codes

| Code | Meaning                                                                                              |
| ---- | ---------------------------------------------------------------------------------------------------- |
| `0`  | Scan completed with no findings at or above `--fail-on` severity                                     |
| `1`  | Scan completed and findings were reported at or above `--fail-on` severity                           |
| `2`  | Invalid arguments, missing/malformed `package.json`, symlink outside scan root, or operational error |

## Sample Output

```text
portacheck v0.1.0 — /path/to/sample-unportable-app (sample-unportable-app)

[ERROR] PC002 (unix-only-command) in script "clean:unix"
  Matched:    rm
  Script:     rm -rf dist
  Why:        Commands such as `rm`, `cp`, `mv`, `touch`, `mkdir -p`, `export`, `chmod`, `cat`, and `which` are not available or behave differently in Windows `cmd.exe` and PowerShell.
  Suggestion: Replace with cross-platform Node packages (`rimraf` for `rm`, `shx` or `cpx2` for `cp`/`mv`/`mkdir`, `cross-env` for `export`) or a small `node -e` / `.mjs` script.

[ERROR] PC001 (unix-env-assignment) in script "start:unix"
  Matched:    NODE_ENV=production
  Script:     NODE_ENV=production node server.js
  Why:        Inline environment variable assignments like `NODE_ENV=production cmd` work in POSIX shells (macOS/Linux) but fail in Windows `cmd.exe` and PowerShell.
  Suggestion: Use `cross-env` (e.g., `cross-env NODE_ENV=production node app.js`) or read/set configuration inside a Node.js script.

Summary: 5 finding(s) in 7 script(s) (4 error, 1 warning, 0 info)
```

## Rules

| ID      | Slug                          | Severity  | Heuristic | Description                                                                                         |
| ------- | ----------------------------- | --------- | --------- | --------------------------------------------------------------------------------------------------- |
| `PC001` | `unix-env-assignment`         | `error`   | No        | Inline `VAR=value cmd` environment assignments                                                      |
| `PC002` | `unix-only-command`           | `error`   | No        | Unix-only commands (`rm`, `cp`, `mv`, `touch`, `mkdir -p`, `export`, `chmod`, `cat`, `which`, etc.) |
| `PC003` | `windows-only-command`        | `error`   | No        | Windows-only commands/syntax (`SET`, `del`, `rmdir`, `xcopy`, `where`, `powershell`, `$env:VAR`)    |
| `PC004` | `shell-background-operator`   | `error`   | Yes       | Background execution with single `&`                                                                |
| `PC005` | `platform-env-expansion`      | `warning` | Yes       | Shell-specific `$VAR`, `${VAR}`, or `%VAR%` expansion                                               |
| `PC006` | `single-quoted-args`          | `warning` | Yes       | Single-quoted arguments (`'...'`), which `cmd.exe` passes literally                                 |
| `PC007` | `command-substitution`        | `error`   | Yes       | POSIX `$(...)`, backtick `` `...` ``, or `<(...)` substitution                                      |
| `PC008` | `bashism-syntax`              | `warning` | Yes       | Bash extensions (`[[`, `source`, `<<<`, `&>`, `                                                     | &`, `{a,b}`) |
| `PC009` | `platform-specific-path`      | `warning` | Yes       | Backslash paths (`.\a\b`), drive letters (`C:\`), `/dev/null`, `/tmp/`, `~/`                        |
| `PC010` | `unquoted-glob-pattern`       | `info`    | Yes       | Unquoted globs (`src/**/*.ts`) with shell-dependent expansion                                       |
| `PC011` | `unsafe-script-pattern`       | `warning` | Yes       | Potentially unsafe patterns (`curl \| sh`, `sudo`, `eval`, `rm -rf /`)                              |
| `PC012` | `semicolon-command-separator` | `info`    | Yes       | `;` command separator (unsupported in `cmd.exe`)                                                    |

## Configuration & Suppressions

Create a `.portacheckrc.json` file in your project root to suppress specific rules, skip scripts, or override rule severities:

```json
{
  "ignoreRules": ["PC010"],
  "ignoreScripts": ["legacy:unix"],
  "rules": {
    "PC006": "info",
    "PC012": "off"
  }
}
```

Rules can be referenced by ID (e.g., `"PC010"`) or slug (e.g., `"unquoted-glob-pattern"`).

## Programmatic API

```ts
import { analyzeScripts, scanDirectory } from 'portacheck';

const result = scanDirectory('./my-project');
console.log(result.summary);

const inline = analyzeScripts({
  build: 'NODE_ENV=production tsc',
});
console.log(inline.diagnostics);
```

## Limitations

- `portacheck` uses a lightweight shell-like tokenizer rather than a full POSIX/PowerShell/CMD AST parser. Complex multi-line scripts or deeply nested quoting may produce heuristic false positives or false negatives.
- `portacheck` does not read `.env` files, resolve `PATH` binaries on your machine, or inspect external `.sh` / `.ps1` files referenced by scripts.
- `portacheck` never auto-edits `package.json`; recommendations are printed for you to review and apply.

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how to add a new rule and run checks locally.

## License

[MIT](LICENSE)
