# Architecture

`portacheck` is structured into small, single-purpose TypeScript modules under `src/` with zero runtime dependencies.

## Module Overview

- `src/types.ts`: Shared interfaces for rules, parsed segments, diagnostics, configuration, and CLI options.
- `src/parser.ts`: Lightweight, non-executing shell-like tokenizer (`parseScriptSegments`) that splits a script string on operators (`&&`, `||`, `;`, `|`, `&`) while respecting single/double quotes and backslash escapes.
- `src/rules.ts`: Declarative rule registry (`RULES` and `RULE_MAP`) with stable IDs (`PC001`–`PC012`).
- `src/scanner.ts`: Safe, read-only filesystem loader (`scanDirectory`) and pure in-memory analyzer (`analyzeScripts`). Enforces symlink-escape checks and size/diagnostic bounds.
- `src/reporters.ts`: Human-readable text formatter (`formatText`) and deterministic CI JSON formatter (`formatJson`).
- `src/cli.ts`: Argument parsing via `node:util` `parseArgs` and exit code mapping (`0`, `1`, `2`).
- `src/index.ts`: Public programmatic API exports.
- `bin/portacheck.js`: Executable CLI entry point.

## How to Add a New Rule

1. Open `src/rules.ts` and pick the next available ID (e.g., `PC013`).
2. Add a `RuleDefinition` object to `RULES`:
   - `id`: Stable ID (`PC013`).
   - `slug`: Unique kebab-case slug.
   - `title`: Short descriptive title.
   - `category`: `'env' | 'command' | 'shell' | 'path' | 'safety'`.
   - `severity`: `'error' | 'warning' | 'info'`.
   - `heuristic`: `true` if pattern matching can have false positives/negatives, `false` if exact.
   - `explanation`: Clear, accurate description of cross-platform behavior.
   - `suggestion`: Safe, portable alternative.
   - `check(scriptName, scriptValue, context)`: Pure function returning `RuleMatch[]`. Never execute commands or perform I/O.
3. Add positive and negative unit tests in `test/rules.test.ts`.
4. Document the new rule in the `Rules` table in `README.md`.
5. Run `npm run format:check && npm run lint && npm run typecheck && npm test`.
