import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const { applyPatchAtPath, formatDiagnostic, sha256 } = await import("../lib/patch-core.ts");
const { readFile: readFixture } = await import("node:fs/promises");

const failureSignature = 'import { protoBase64 } from "@bufbuild/protobuf";';
const replacement =
  'import * as protobufModule from "@bufbuild/protobuf";\nconst protoBase64 = protobufModule.protoBase64 ?? protobufModule.default?.protoBase64;';
const safeSignature = 'import * as protobufModule from "@bufbuild/protobuf";';
const fixture = await readFixture(new URL("./fixtures/http-headers-original.js", import.meta.url), "utf8");
const patchedFixture = fixture.replace(failureSignature, replacement);

function entryFor(original = fixture, patched = original.replace(failureSignature, replacement)) {
  return {
    id: "fixture-entry",
    graph: {
      piCursorSdk: "0.2.0",
      cursorSdk: "1.0.23",
      connect: "1.7.0",
      protobuf: "1.10.0",
    },
    targetPackage: "@connectrpc/connect",
    targetRelativePath: "dist/esm/http-headers.js",
    failureSignature,
    replacement,
    safeSignatures: [safeSignature],
    originalSha256: sha256(original),
    patchedSha256: sha256(patched),
  };
}

async function tempTarget(content) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pi-cursor-embedded-compat-"));
  const targetPath = path.join(directory, "http-headers.js");
  await writeFile(targetPath, content, "utf8");
  return { directory, targetPath };
}

test("patches the registered failure signature and verifies the output hash", async () => {
  const entry = entryFor();
  const { targetPath } = await tempTarget(fixture);

  const result = applyPatchAtPath(targetPath, entry);

  assert.equal(result.ok, true);
  assert.equal(result.action, "patched");
  assert.equal(result.finalSha256, entry.patchedSha256);
  assert.equal(await readFile(targetPath, "utf8"), patchedFixture);
});

test("is idempotent after the first patch", async () => {
  const entry = entryFor();
  const { targetPath } = await tempTarget(fixture);

  assert.equal(applyPatchAtPath(targetPath, entry).action, "patched");
  const result = applyPatchAtPath(targetPath, entry);

  assert.equal(result.ok, true);
  assert.equal(result.action, "already_patched");
});

test("bypasses a known-safe upstream shape", async () => {
  const entry = entryFor();
  const upstream = `${safeSignature}\nconst protoBase64 = protobufModule.protoBase64;\n`;
  const { targetPath } = await tempTarget(upstream);

  const result = applyPatchAtPath(targetPath, entry);

  assert.equal(result.ok, true);
  assert.equal(result.action, "upstream_fixed");
  assert.equal(await readFile(targetPath, "utf8"), upstream);
});

test("fails closed for an unknown hash that still has the failure signature", async () => {
  const entry = entryFor();
  const unknown = fixture.replace("protoBase64.enc(bytes)", "protoBase64.enc(bytes, true)");
  const { targetPath } = await tempTarget(unknown);

  const result = applyPatchAtPath(targetPath, entry);

  assert.equal(result.ok, false);
  assert.equal(result.code, "signature_mismatch");
  assert.equal(await readFile(targetPath, "utf8"), unknown);
});

test("fails closed for unknown content without a safe signature", async () => {
  const entry = entryFor();
  const unknown = "export const unrelated = true;\n";
  const { targetPath } = await tempTarget(unknown);

  const result = applyPatchAtPath(targetPath, entry);

  assert.equal(result.ok, false);
  assert.equal(result.code, "signature_mismatch");
});

test("returns bounded structured diagnostics without file content", () => {
  const result = {
    ok: false,
    code: "unsupported_graph",
    graph: entryFor().graph,
    message: "resolved Cursor dependency graph is not in the support registry",
  };

  const diagnostic = formatDiagnostic(result);

  assert.match(diagnostic, /^\[cursor_compat\] \{/);
  assert.match(diagnostic, /"code":"unsupported_graph"/);
  assert.doesNotMatch(diagnostic, /protoBase64|source content|C:\\Users/);
});

test("maps write and read-back failures to bounded codes", () => {
  const entry = entryFor();
  const failingWrite = applyPatchAtPath("ignored", entry, entry.graph, {
    readText: () => fixture,
    writeAtomic: () => {
      throw new Error("write failed");
    },
  });
  assert.equal(failingWrite.ok, false);
  assert.equal(failingWrite.code, "write_failed");

  let reads = 0;
  const failingVerify = applyPatchAtPath("ignored", entry, entry.graph, {
    readText: () => {
      reads += 1;
      return reads === 1 ? fixture : `${patchedFixture}\ncorrupt`;
    },
    writeAtomic: () => undefined,
  });
  assert.equal(failingVerify.ok, false);
  assert.equal(failingVerify.code, "verify_failed");
});
