# Contributing to portacheck

Thank you for your interest in contributing to `portacheck`!

## Development Setup

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/portacheck.git
cd portacheck
npm install
```

## Local Validation Commands

Run all checks before opening a pull request:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

## Adding a New Rule

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the rule interface and step-by-step instructions. Every new rule must include:

- A unique stable ID (`PC0xx`) and kebab-case slug
- Clear `explanation` and safe `suggestion`
- Accurate `heuristic` flag (`true` if pattern-based/heuristic)
- Both positive and negative unit test cases in `test/rules.test.ts`
- Documentation in `README.md`

## Safety Requirements

- `portacheck` must **never** execute scanned scripts, spawn commands from scanned repositories, modify scanned files, or make network calls.
- Never include real secrets, tokens, or personal information in test fixtures or examples.
