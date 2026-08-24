# Release

This package uses npm Trusted Publishing with GitHub Actions OIDC. Do not add `NPM_TOKEN` or long-lived npm tokens.

## Checklist

1. Pair registry/hash changes with fixture and live-graph evidence.
2. Bump `package.json` and `CHANGELOG.md` together.
3. Run `npm run ci` and inspect `npm pack --dry-run`.
4. Push the version bump to `main`.
5. Confirm the generated tag/release and `publish.yml` handoff.
6. Verify npm provenance after the human-controlled first publish.

The first publish requires npm Trusted Publisher configuration for this GitHub repository and `publish.yml`. The agent may run pack and dry-run checks, but the final publish/OTP boundary remains human-owned.
