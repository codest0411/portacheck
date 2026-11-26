# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-26

### Added

- Initial public-ready release of `portacheck` with zero runtime dependencies.
- 12 static portability rules (`PC001`–`PC012`) covering inline env assignments, Unix-only commands, Windows-only commands, background `&`, env expansion, single-quoted args, command substitution, bashisms, platform paths, unquoted globs, unsafe script patterns, and `;` separators.
- CLI (`portacheck`) with `--path`, `--format text|json`, `--fail-on error|warning|info|none`, `--help`, and `--version`.
- Safe `.portacheckrc.json` configuration for rule suppressions, script ignores, and severity overrides.
- Symlink-escape protection, bounded file/script/diagnostic limits, and typed programmatic API.
