## Pi SDK 1.2.0 compatibility

This package is verified with the frozen SDK versions:

- `@earendil-works/pi-agent-core`: `1.2.0`
- `@earendil-works/pi-ai`: `1.2.0`
- `@earendil-works/pi-coding-agent`: `1.2.0`
- `@earendil-works/pi-tui`: `1.2.0`

These exact versions are development and verification pins only. The public
`@earendil-works/pi-coding-agent` peer range remains `*`. This extension only
uses `ExtensionAPI` as a type-only import; its runtime compatibility path uses
Node APIs and does not register Pi events, tools, or commands. The template
baseline's verified [Pi SDK 1.2.0 migration notes](https://github.com/eiei114/pi-extension-template/blob/4b0554151161eae665aa2cdc845a2d7df40e4781/docs/pi-sdk-compatibility.md)
and the [official v1.2.0 release notes](https://github.com/earendil-works/pi/releases/tag/v1.2.0)
identify no deprecated API used by this extension that needs replacement.

Pi 1.2.0 changes `before_agent_start` events to a `messageType` union; handlers
that read user-only fields should check for `messageType === "user"` first.
This extension does not subscribe to that event, so no code migration is
needed. The startup session-idle behavior changes documented by the baseline
also do not apply because this extension does not send messages during startup.

Run `npm run smoke:pi` to exercise the actual pinned Pi CLI and this extension.
`npm run ci` runs the harness, and the committed Windows run is recorded in
`docs/verification/pi-sdk-smoke.json` using `pi-sdk-behavior-v2`. It asserts
extension loading, the patch response, handled unsupported-signature behavior,
a second Pi process's reload response and clean exit, and the native shell
boundary (PowerShell on Windows, `/bin/sh` on POSIX). Each Pi probe has a
15-second deadline and records process exit.

Verification is offline and does not invoke a model. Only the Cursor dependency
graph and target file are synthetic. The pinned Pi SDK/host process, extension
loader and code, dependency resolution, patch write/read-back, error handling,
process cleanup, and native shell are real. The smoke harness and contract tests
reject missing reload responses and other failed assertions.
