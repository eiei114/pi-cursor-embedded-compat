import assert from "node:assert/strict";
import test from "node:test";

const { SUPPORT_REGISTRY } = await import("../lib/registry.ts");

const SHA_PATTERN = /^[a-f0-9]{64}$/;

test("registers each supported Cursor dependency graph exactly once", () => {
  const ids = SUPPORT_REGISTRY.map((entry) => entry.id);
  const graphs = SUPPORT_REGISTRY.map((entry) => JSON.stringify(entry.graph));

  assert.equal(new Set(ids).size, ids.length, "entry ids must be unique");
  assert.equal(new Set(graphs).size, graphs.length, "dependency graphs must be unique");

  const pairs = new Set(SUPPORT_REGISTRY.map((entry) => `${entry.graph.piCursorSdk}/${entry.graph.cursorSdk}`));
  assert.ok(pairs.has("0.2.0/1.0.23"), "the original embedded graph must stay supported");
  assert.ok(pairs.has("0.3.6/1.0.31"), "the pi-agent-bundles v0.10.0 graph must stay supported");
});

test("keeps every entry hashed and fully specified", () => {
  for (const entry of SUPPORT_REGISTRY) {
    assert.match(entry.originalSha256, SHA_PATTERN, `${entry.id} original hash`);
    assert.match(entry.patchedSha256, SHA_PATTERN, `${entry.id} patched hash`);
    assert.notEqual(entry.originalSha256, entry.patchedSha256, `${entry.id} must change content`);
    assert.ok(entry.failureSignature.length > 0, `${entry.id} failure signature`);
    assert.ok(entry.safeSignatures.length > 0, `${entry.id} safe signatures`);
    assert.equal(entry.targetPackage, "@connectrpc/connect");
    assert.equal(entry.targetRelativePath, "dist/esm/http-headers.js");
    assert.equal(entry.graph.connect, "1.7.0");
    assert.equal(entry.graph.protobuf, "1.10.0");
  }
});

test("shares one verified transform across graphs that embed the same connect 1.7.0 file", () => {
  const shapes = new Set(
    SUPPORT_REGISTRY.map((entry) =>
      JSON.stringify({
        targetRelativePath: entry.targetRelativePath,
        failureSignature: entry.failureSignature,
        replacement: entry.replacement,
        originalSha256: entry.originalSha256,
        patchedSha256: entry.patchedSha256,
      }),
    ),
  );

  assert.equal(shapes.size, 1, "connect 1.7.0 transforms must not diverge per graph");
});
