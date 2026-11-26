# Security Policy

## Supported Versions

Only the latest `0.x` release of `portacheck` is currently supported with security updates.

## Security Model

`portacheck` is a **read-only static analyzer**:

- It reads `package.json` and `.portacheckrc.json` as data only.
- It never executes scripts, installs packages, or runs shell commands from scanned repositories.
- It rejects symlinks that resolve outside the target scan root.
- It enforces file size and diagnostic count limits to prevent denial-of-service on malformed or oversized inputs.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report vulnerabilities privately via GitHub Security Advisories on the repository ("Security" -> "Advisories" -> "Report a vulnerability"), or contact the maintainer directly.

Please include:

- A description of the vulnerability and potential impact
- Steps to reproduce or a minimal proof-of-concept `package.json`
- Affected `portacheck` version and Node.js version

We aim to acknowledge reports within 72 hours and provide a fix or mitigation plan as quickly as possible.
