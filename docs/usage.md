# Usage

## Explicit profile

Load the shim before `pi-cursor-sdk`:

```json
["--no-extensions", "-e", "npm:pi-cursor-embedded-compat@0.2.6", "-e", "npm:pi-cursor-sdk"]
```

The shim checks the four-package graph, resolves `@connectrpc/connect` through the Pi npm layout, and applies the registered transform before the first Cursor request. It does not register a provider or issue a retry.

## Outcome handling

The shim writes a `[cursor_compat]` record to stderr. Read the JSON after the prefix:

- `action` identifies a successful shim compatibility outcome: `patched`, `already_patched`, or `upstream_fixed`.
- `code` identifies a shim compatibility failure, not a provider-startup failure. On this path the shim logs the diagnostic and returns normally without aborting extension loading or making a request.

For example, this synthetic record means the shim could not resolve a required package:

```text
[cursor_compat] {"source":"pi-cursor-embedded-compat","code":"resolution_failed","message":"required package could not be resolved: @cursor/sdk"}
```

Neither field proves that the provider started, failed to start, or handled a request. The existing outer Multica routing policy still decides whether to reroute.
