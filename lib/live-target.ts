import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { DependencyGraph, ResolutionResult } from "./contracts.ts";
import { SUPPORT_REGISTRY } from "./registry.ts";

const require = createRequire(import.meta.url);

const REQUIRED_PACKAGES = [
  "pi-cursor-sdk",
  "@cursor/sdk",
  "@connectrpc/connect",
  "@bufbuild/protobuf",
] as const;

type RequiredPackage = (typeof REQUIRED_PACKAGES)[number];

interface PackageInfo {
  root: string;
  version: string;
}

function readPackageInfo(packageName: RequiredPackage): PackageInfo | undefined {
  let resolved: string;
  try {
    // Pi packages commonly expose only a `pi.extensions` manifest and no
    // `main`/`exports` entry. Resolve their package.json directly first, then
    // fall back to the executable entry used by ordinary npm packages.
    resolved = require.resolve(`${packageName}/package.json`);
  } catch {
    try {
      resolved = require.resolve(packageName);
    } catch {
      return undefined;
    }
  }

  let current = dirname(resolved);
  while (true) {
    try {
      const packageJson = require(join(current, "package.json")) as { name?: string; version?: string };
      if (packageJson.name === packageName && typeof packageJson.version === "string") {
        return { root: current, version: packageJson.version };
      }
    } catch {
      // Keep walking toward the runtime's package root.
    }

    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function graphMatches(left: DependencyGraph, right: DependencyGraph): boolean {
  return (
    left.piCursorSdk === right.piCursorSdk &&
    left.cursorSdk === right.cursorSdk &&
    left.connect === right.connect &&
    left.protobuf === right.protobuf
  );
}

export function resolveLiveTarget(): ResolutionResult {
  const info = new Map<RequiredPackage, PackageInfo>();
  for (const packageName of REQUIRED_PACKAGES) {
    const packageInfo = readPackageInfo(packageName);
    if (!packageInfo) {
      return {
        ok: false,
        code: "resolution_failed",
        message: `required package could not be resolved: ${packageName}`,
      };
    }
    info.set(packageName, packageInfo);
  }

  const graph: DependencyGraph = {
    piCursorSdk: info.get("pi-cursor-sdk")!.version,
    cursorSdk: info.get("@cursor/sdk")!.version,
    connect: info.get("@connectrpc/connect")!.version,
    protobuf: info.get("@bufbuild/protobuf")!.version,
  };
  const entry = SUPPORT_REGISTRY.find((candidate) => graphMatches(candidate.graph, graph));
  if (!entry) {
    return {
      ok: false,
      code: "unsupported_graph",
      graph,
      message: "resolved Cursor dependency graph is not in the support registry",
    };
  }

  return {
    ok: true,
    entry,
    graph,
    targetPath: join(info.get("@connectrpc/connect")!.root, entry.targetRelativePath),
  };
}
