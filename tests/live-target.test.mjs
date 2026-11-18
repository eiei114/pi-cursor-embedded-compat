import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

const { resolveLiveTarget } = await import("../lib/live-target.ts");
const { formatDiagnostic } = await import("../lib/patch-core.ts");
const { SUPPORT_REGISTRY } = await import("../lib/registry.ts");

const supportedEntry = SUPPORT_REGISTRY[0];
const packageRoots = {
  "pi-cursor-sdk": "C:\\private\\dependency-root\\pi-cursor-sdk",
  "@cursor/sdk": "C:\\private\\dependency-root\\cursor-sdk",
  "@connectrpc/connect": "C:\\private\\dependency-root\\connect",
  "@bufbuild/protobuf": "C:\\private\\dependency-root\\protobuf",
};

function dependenciesFor(graph) {
  const versions = {
    "pi-cursor-sdk": graph.piCursorSdk,
    "@cursor/sdk": graph.cursorSdk,
    "@connectrpc/connect": graph.connect,
    "@bufbuild/protobuf": graph.protobuf,
  };

  return {
    resolvePackageInfo(packageName) {
      return { root: packageRoots[packageName], version: versions[packageName] };
    },
  };
}

function assertBoundedFailureDiagnostic(result, { code, message, graph }) {
  const diagnostic = formatDiagnostic(result);

  assert.match(diagnostic, /^\[cursor_compat\] \{/);
  const payload = JSON.parse(diagnostic.slice("[cursor_compat] ".length));
  assert.deepEqual(payload, {
    source: "pi-cursor-embedded-compat",
    code,
    ...(graph ? { graph } : {}),
    message,
  });
  if (graph) assert.deepEqual(result.graph, graph);
  for (const root of Object.values(packageRoots)) {
    assert.ok(!diagnostic.includes(root), "diagnostic must not expose resolved package roots");
  }
  assert.doesNotMatch(diagnostic, /[A-Za-z]:[\\/]|dependency file contents|SECRET_DEPENDENCY_FILE_CONTENTS|protoBase64/);
}

test("resolves a supported graph with injected package information", () => {
  const resolvedPackages = [];
  const dependencies = dependenciesFor(supportedEntry.graph);
  const result = resolveLiveTarget({
    resolvePackageInfo(packageName) {
      resolvedPackages.push(packageName);
      return dependencies.resolvePackageInfo(packageName);
    },
  });

  assert.deepEqual(resolvedPackages, [
    "pi-cursor-sdk",
    "@cursor/sdk",
    "@connectrpc/connect",
    "@bufbuild/protobuf",
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.entry, supportedEntry);
  assert.deepEqual(result.graph, supportedEntry.graph);
  assert.equal(
    result.targetPath,
    path.join(packageRoots["@connectrpc/connect"], supportedEntry.targetRelativePath),
  );
});

test("snapshots package information when the injected resolver reuses an object", () => {
  const versions = {
    "pi-cursor-sdk": supportedEntry.graph.piCursorSdk,
    "@cursor/sdk": supportedEntry.graph.cursorSdk,
    "@connectrpc/connect": supportedEntry.graph.connect,
    "@bufbuild/protobuf": supportedEntry.graph.protobuf,
  };
  const packageInfo = { root: "", version: "" };
  const result = resolveLiveTarget({
    resolvePackageInfo(packageName) {
      packageInfo.root = packageRoots[packageName];
      packageInfo.version = versions[packageName];
      return packageInfo;
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.graph, supportedEntry.graph);
  assert.equal(
    result.targetPath,
    path.join(packageRoots["@connectrpc/connect"], supportedEntry.targetRelativePath),
  );
});

test("reports the missing package with a bounded resolution_failed diagnostic", () => {
  const result = resolveLiveTarget({
    resolvePackageInfo(packageName) {
      if (packageName === "@cursor/sdk") return undefined;
      return dependenciesFor(supportedEntry.graph).resolvePackageInfo(packageName);
    },
  });

  assert.deepEqual(result, {
    ok: false,
    code: "resolution_failed",
    message: "required package could not be resolved: @cursor/sdk",
  });
  assertBoundedFailureDiagnostic(result, {
    code: "resolution_failed",
    message: "required package could not be resolved: @cursor/sdk",
  });
});

test("returns the observed unsupported graph in a bounded diagnostic", () => {
  const graph = {
    ...supportedEntry.graph,
    piCursorSdk: "9.9.9",
  };
  const result = resolveLiveTarget(dependenciesFor(graph));

  assert.deepEqual(result, {
    ok: false,
    code: "unsupported_graph",
    graph,
    message: "resolved Cursor dependency graph is not in the support registry",
  });
  assertBoundedFailureDiagnostic(result, {
    code: "unsupported_graph",
    message: "resolved Cursor dependency graph is not in the support registry",
    graph,
  });
});
