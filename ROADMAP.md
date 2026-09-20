# Pi Cursor Embedded Compatibility Roadmap

## Current status

Specified and under initial implementation. The first milestone targets the DOT-1586 live dependency graph only; 0.2.0 adds the `pi-cursor-sdk 0.3.6` / `@cursor/sdk 1.0.31` graph used by `pi-agent-bundles` v0.10.0.

## Next

- Complete the guarded patch core and fixture tests.
- Run the local and Multica marker-only canaries.
- Integrate the exact-pinned package into the verified Cursor bundle.
- Retire the shim after an upstream fix is proven in the embedded host.

Broader host support, dependency graphs outside the registered pairs, and routing fallback are out of scope.
