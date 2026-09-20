# Pi Cursor Embedded Compatibility

[![CI](https://github.com/eiei114/pi-cursor-embedded-compat/actions/workflows/ci.yml/badge.svg)](https://github.com/eiei114/pi-cursor-embedded-compat/actions/workflows/ci.yml)
[![Publish](https://github.com/eiei114/pi-cursor-embedded-compat/actions/workflows/publish.yml/badge.svg)](https://github.com/eiei114/pi-cursor-embedded-compat/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/pi-cursor-embedded-compat.svg)](https://www.npmjs.com/package/pi-cursor-embedded-compat)
[![npm downloads](https://img.shields.io/npm/dm/pi-cursor-embedded-compat.svg)](https://www.npmjs.com/package/pi-cursor-embedded-compat)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Pi package](https://img.shields.io/badge/pi-package-purple.svg)](https://pi.dev/packages)
[![Trusted Publishing](https://img.shields.io/badge/npm-Trusted%20Publishing-blue.svg)](docs/release.md)

> Guard the embedded Pi Cursor SDK request path against known ESM/CJS module-resolution failures.

## What this is

`pi-cursor-embedded-compat` is a narrow Pi extension for embedded Pi hosts that load the Cursor SDK through `pi-cursor-sdk`. It applies one version- and hash-guarded compatibility transform to the known `@connectrpc/connect` request-time module shape, then leaves Cursor provider routing unchanged.

This is a temporary compatibility boundary. It does not replace Cursor authentication, register another provider, retry requests, or perform model fallback.

## Features

- Exact dependency-graph and content-hash support registry.
- Namespace import plus `default.protoBase64` fallback for the known failure.
- Atomic write, read-back verification, idempotency, and fail-closed unknown-signature handling.
- Bounded structured stderr diagnostics without secrets or source-file contents.
- Secret-free fixtures plus an opt-in live marker-only canary path.

## Install

```bash
pi install npm:pi-cursor-embedded-compat
```

Load it before `pi-cursor-sdk` in an embedded Cursor profile:

```json
["--no-extensions", "-e", "npm:pi-cursor-embedded-compat@0.2.0", "-e", "npm:pi-cursor-sdk"]
```

The extension performs its check when loaded. It does not expose a command or tool.

## Diagnostics

Successful outcomes use `patched`, `already_patched`, `upstream_fixed`, or `not_applicable`. Failures use bounded codes such as `unsupported_graph`, `signature_mismatch`, `write_failed`, or `verify_failed`.

Example shape:

```text
[cursor_compat] {"source":"pi-cursor-embedded-compat","action":"patched","entryId":"connect-1.7.0-pi-cursor-sdk-0.2.0","target":"dist/esm/http-headers.js","graph":{"piCursorSdk":"0.2.0","cursorSdk":"1.0.23","connect":"1.7.0","protobuf":"1.10.0"}}
```

Registered graphs: `pi-cursor-sdk 0.2.0` / `@cursor/sdk 1.0.23` and `pi-cursor-sdk 0.3.6` / `@cursor/sdk 1.0.31`, both on `@connectrpc/connect 1.7.0` and `@bufbuild/protobuf 1.10.0`.

An unknown failing signature stops the shim without modifying the file. Rollback is performed by reinstalling the dependency tree; the shim does not keep third-party backups.

## Development

```bash
npm install
npm run ci
```

The live canary is intentionally not part of CI. Run it only from an existing Pi/Multica secret boundary; never paste or print a Cursor API key.

## Release

This package uses npm Trusted Publishing with GitHub Actions OIDC. No `NPM_TOKEN` is required.

```bash
npm version patch
git push
```

See [`docs/release.md`](docs/release.md).

## Security

Pi packages execute with the local user's permissions. This package writes one exact dependency file after verifying its version and content hash. Review the support registry before installing. Do not run the live canary with a credential outside the existing secret boundary.

## Links

- npm: https://www.npmjs.com/package/pi-cursor-embedded-compat
- GitHub: https://github.com/eiei114/pi-cursor-embedded-compat
- Issues: https://github.com/eiei114/pi-cursor-embedded-compat/issues
- Upstream incident: https://github.com/fitchmultz/pi-cursor-sdk/issues/233

## License

MIT
