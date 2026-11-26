# Competitor & Ecosystem Research

**Date checked:** 2026-11-26  
**Registry checked:** npm (`registry.npmjs.org`)

## Package Name Availability

- `portascript`: **Taken** (`portascript@0.1.0` — _"Lint your package.json npm scripts for non-portable shell that breaks on Windows."_).
- `portacheck`: **Available** (`npm view portacheck` returned `E404 Not Found`).

Because `portascript` is already published on npm with a closely related description, this project uses **`portacheck`** as its package name, binary name, and repository name.

## Closest Existing Tools

| Tool                                                                 | Category                     | What it does                                                                           | Gap `portacheck` addresses                                                                                                                                                                                                              |
| -------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`portascript`](https://www.npmjs.com/package/portascript) (`0.1.0`) | `package.json` script linter | Lints `package.json` scripts for shell patterns that break on Windows.                 | Early/minimal `0.1.0` release; `portacheck` provides bidirectional Windows + macOS/Linux checks, `.portacheckrc.json` suppressions, stable JSON CI output, configurable `--fail-on` severity thresholds, and zero runtime dependencies. |
| [`cross-env`](https://www.npmjs.com/package/cross-env)               | Runtime wrapper              | Sets inline environment variables portably across Windows, macOS, and Linux.           | Fixes env var syntax at runtime, but does not audit `package.json` for missing `cross-env` or other shellisms.                                                                                                                          |
| [`rimraf`](https://www.npmjs.com/package/rimraf)                     | Runtime utility              | Cross-platform `rm -rf` implementation in Node.js.                                     | Replaces `rm -rf` at runtime; does not detect `rm`, `cp`, `touch`, etc. in `package.json`.                                                                                                                                              |
| [`shx`](https://www.npmjs.com/package/shx)                           | Runtime utility              | Exposes ShellJS Unix commands (`cp`, `mkdir`, `rm`, etc.) for npm scripts.             | Runtime replacement; does not statically lint `package.json` scripts.                                                                                                                                                                   |
| [`npm-run-all2`](https://www.npmjs.com/package/npm-run-all2)         | Task runner                  | Runs npm scripts sequentially (`run-s`) or in parallel (`run-p`) portably.             | Runtime orchestrator; does not warn when scripts use `&` or `;`.                                                                                                                                                                        |
| [`shellcheck`](https://www.shellcheck.net/)                          | Static analyzer              | Static analysis for `.sh` / Bash / Dash shell scripts.                                 | Targets standalone shell script files, not `package.json` `scripts` or Windows `cmd.exe` / PowerShell incompatibilities.                                                                                                                |
| [`npm-lint`](https://www.npmjs.com/package/npm-lint) (`0.3.4`)       | `package.json` linter        | Configurable `package.json` linter focused on security and allowed script executables. | Focuses on policy/security allowlists rather than cross-OS portability explanations and fixes.                                                                                                                                          |
| [`publint`](https://www.npmjs.com/package/publint) (`0.3.25`)        | Packaging linter             | Lints `package.json` `exports`, `main`, and module resolution fields.                  | Focuses on package entry-point compatibility, not `scripts` portability.                                                                                                                                                                |

## Summary of Differentiator

`portacheck` is a **zero-runtime-dependency, read-only static analyzer** specifically for `package.json` `scripts` that:

1. Detects both **Unix-on-Windows** issues (`NODE_ENV=`, `rm`, `cp`, `touch`, `export`, `&`, `;`, `$()`, bashisms, single quotes) and **Windows-on-Unix** issues (`SET`, `del`, `rmdir`, `powershell`, `$env:VAR`, `%VAR%`, backslash paths).
2. Explains _why_ each pattern fails or behaves differently across `cmd.exe`, PowerShell, `/bin/sh`, and Bash, and suggests concrete portable alternatives.
3. Enforces strict safety boundaries (never executes scripts, rejects symlink escapes, bounds input/output sizes) and provides stable JSON output + exit codes (`0`/`1`/`2`) for CI.
