# Usage

## Explicit profile

Load the shim before `pi-cursor-sdk`:

```json
["--no-extensions", "-e", "npm:pi-cursor-embedded-compat@0.1.0", "-e", "npm:pi-cursor-sdk"]
```

The shim checks the four-package graph, resolves `@connectrpc/connect` through the Pi npm layout, and applies the registered transform before the first Cursor request. It does not register a provider or issue a retry.

## Outcome handling

Treat `patched`, `already_patched`, and `upstream_fixed` as successful compatibility outcomes. Treat any failure code as a provider-startup failure and let the outer Multica routing policy decide whether to reroute.
