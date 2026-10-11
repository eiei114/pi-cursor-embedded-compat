## Pi SDK 1.1.0 compatibility

This package is tested with the frozen Pi SDK versions:

- `@earendil-works/pi-agent-core`: `1.1.0`
- `@earendil-works/pi-ai`: `1.1.0`
- `@earendil-works/pi-coding-agent`: `1.1.0`
- `@earendil-works/pi-tui`: `1.1.0`

The public `@earendil-works/pi-coding-agent` peer range remains `*`; these exact
versions are development and verification pins only. The extension uses
`ExtensionAPI` as a type-only import and Node APIs for its compatibility check.
The template baseline's verified 1.1.0 guidance and the SDK 1.1.0 release notes
show no deprecated API replacement is needed for this extension surface.

Run `npm run smoke:pi` to load the package's actual extension through the pinned
Pi CLI. It covers extension loading, a hash-verified patch, a handled unknown
signature, a second Pi process over the patched dependency tree, and the native
PowerShell boundary on Windows (or `/bin/sh` on POSIX). The committed report is
`docs/verification/pi-sdk-smoke.json`; `npm run ci` executes the harness.

The smoke makes no model or network inference calls. It uses a local deterministic
fixture for the Cursor dependency graph and target file, but does not mock the Pi
SDK process, extension loader, package extension code, dependency resolution,
patch write/read-back, error handling, process cleanup, or host shell. Each Pi
probe has a 15-second deadline and records whether process exit was observed.
The report captures each process's stdout/stderr and target-file hash. A deliberate
extension-load failure in `error_path` is expected: Pi reports the exact
`signature_mismatch` and exits with its expected nonzero status. It counts as
handled only when the failure is captured, the target stays unchanged, and no
unhandled error occurs; unexpected load errors remain failures.
