# Changelog

## 0.2.0

- Register the `pi-cursor-sdk 0.3.6` / `@cursor/sdk 1.0.31` dependency graph used by `pi-agent-bundles` v0.10.0, so Cursor lanes stop failing closed with `unsupported_graph`.
- Share one verified `@connectrpc/connect` 1.7.0 transform across registered graphs.
- Add registry integrity tests for unique graphs, hashes, and shared transforms.

## 0.1.0

- Initial guarded embedded Cursor compatibility shim for the DOT-1586 live dependency graph.
