# Security Policy

## Supported versions

Only the latest published version receives security fixes.

## Reporting a vulnerability

Open a private security advisory on GitHub, or contact the maintainer by the preferred channel listed in the repository profile.

Please include:

- Affected version
- Impact
- Reproduction steps
- Suggested fix, if known

## Pi package security note

Pi packages can execute code with local user permissions. Review installed packages and avoid running untrusted extensions.

Do not include Cursor API keys, local runtime logs, or full dependency files in public issues. This package writes a dependency file only after an exact graph/hash check; report any unexpected write target privately.
