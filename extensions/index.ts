import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { applyPatchAtPath, formatDiagnostic } from "../lib/patch-core.ts";
import { resolveLiveTarget } from "../lib/live-target.ts";

export default function (_pi: ExtensionAPI): void {
  const target = resolveLiveTarget();
  const result = target.ok
    ? applyPatchAtPath(target.targetPath, target.entry, target.graph)
    : target;

  console.error(formatDiagnostic(result));
  if (!result.ok) {
    throw new Error(`[pi-cursor-embedded-compat] ${result.code}`);
  }
}
