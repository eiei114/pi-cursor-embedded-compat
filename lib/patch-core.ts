import crypto from "node:crypto";
import fs from "node:fs";
import type { DependencyGraph, PatchResult, ResolutionFailure, SupportEntry } from "./contracts.ts";

export interface PatchIo {
  readText(targetPath: string): string;
  writeAtomic(targetPath: string, content: string): void;
}

const nodePatchIo: PatchIo = {
  readText(targetPath) {
    return fs.readFileSync(targetPath, "utf8");
  },

  writeAtomic(targetPath, content) {
    const stat = fs.statSync(targetPath);
    if (!stat.isFile()) {
      throw new Error("target is not a regular file");
    }

    const tempPath = `${targetPath}.pi-cursor-embedded-compat.${process.pid}.${Date.now()}.tmp`;
    let descriptor: number | undefined;
    try {
      fs.writeFileSync(tempPath, content, { encoding: "utf8", mode: stat.mode });
      descriptor = fs.openSync(tempPath, "r+");
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      fs.renameSync(tempPath, targetPath);
    } finally {
      if (descriptor !== undefined) {
        fs.closeSync(descriptor);
      }
      if (fs.existsSync(tempPath)) {
        fs.rmSync(tempPath, { force: true });
      }
    }
  },
};

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function countOccurrences(source: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let offset = 0;
  while (true) {
    const index = source.indexOf(needle, offset);
    if (index === -1) return count;
    count += 1;
    offset = index + needle.length;
  }
}

function baseFailure(
  entry: SupportEntry,
  graph: DependencyGraph,
  code: "signature_mismatch" | "verify_failed",
  observedSha256: string,
  message: string,
) {
  return {
    ok: false as const,
    code,
    entryId: entry.id,
    targetRelativePath: entry.targetRelativePath,
    graph,
    observedSha256,
    message,
  };
}

export function applyPatchAtPath(
  targetPath: string,
  entry: SupportEntry,
  graph: DependencyGraph = entry.graph,
  io: PatchIo = nodePatchIo,
): PatchResult {
  let source: string;
  try {
    source = io.readText(targetPath);
  } catch {
    return {
      ok: false,
      code: "read_failed",
      entryId: entry.id,
      targetRelativePath: entry.targetRelativePath,
      graph,
      message: "target dependency file could not be read",
    };
  }

  const observedSha256 = sha256(source);
  if (observedSha256 === entry.patchedSha256) {
    return {
      ok: true,
      action: "already_patched",
      entryId: entry.id,
      targetRelativePath: entry.targetRelativePath,
      graph,
      observedSha256,
      finalSha256: observedSha256,
    };
  }

  if (observedSha256 === entry.originalSha256) {
    const occurrences = countOccurrences(source, entry.failureSignature);
    if (occurrences !== 1) {
      return baseFailure(
        entry,
        graph,
        "signature_mismatch",
        observedSha256,
        "registered original hash does not contain exactly one failure signature",
      );
    }

    const patchedSource = source.replace(entry.failureSignature, entry.replacement);
    const patchedSha256 = sha256(patchedSource);
    if (patchedSha256 !== entry.patchedSha256) {
      return baseFailure(
        entry,
        graph,
        "verify_failed",
        observedSha256,
        "registered transform produced an unexpected hash",
      );
    }

    try {
      io.writeAtomic(targetPath, patchedSource);
    } catch {
      return {
        ok: false,
        code: "write_failed",
        entryId: entry.id,
        targetRelativePath: entry.targetRelativePath,
        graph,
        observedSha256,
        message: "target dependency file could not be replaced atomically",
      };
    }

    let finalSource: string;
    try {
      finalSource = io.readText(targetPath);
    } catch {
      return {
        ok: false,
        code: "verify_failed",
        entryId: entry.id,
        targetRelativePath: entry.targetRelativePath,
        graph,
        observedSha256,
        message: "patched dependency file could not be read back",
      };
    }

    const finalSha256 = sha256(finalSource);
    if (finalSha256 !== entry.patchedSha256) {
      return {
        ok: false,
        code: "verify_failed",
        entryId: entry.id,
        targetRelativePath: entry.targetRelativePath,
        graph,
        observedSha256,
        message: "patched dependency file hash did not verify",
      };
    }

    return {
      ok: true,
      action: "patched",
      entryId: entry.id,
      targetRelativePath: entry.targetRelativePath,
      graph,
      observedSha256,
      finalSha256,
    };
  }

  if (source.includes(entry.failureSignature)) {
    return baseFailure(
      entry,
      graph,
      "signature_mismatch",
      observedSha256,
      "known failure signature found under an unregistered content hash",
    );
  }

  if (entry.safeSignatures.some((signature) => source.includes(signature))) {
    return {
      ok: true,
      action: "upstream_fixed",
      entryId: entry.id,
      targetRelativePath: entry.targetRelativePath,
      graph,
      observedSha256,
      finalSha256: observedSha256,
    };
  }

  return baseFailure(
    entry,
    graph,
    "signature_mismatch",
    observedSha256,
    "target content has neither a registered patch nor a known safe signature",
  );
}

export function formatDiagnostic(result: PatchResult | ResolutionFailure): string {
  const payload = {
    source: "pi-cursor-embedded-compat",
    ...(result.ok
      ? {
          action: result.action,
          entryId: result.entryId,
          target: result.targetRelativePath,
          graph: result.graph,
        }
      : {
          code: result.code,
          entryId: "entryId" in result ? result.entryId : undefined,
          target: "targetRelativePath" in result ? result.targetRelativePath : undefined,
          graph: result.graph,
          message: result.message,
        }),
  };
  return `[cursor_compat] ${JSON.stringify(payload)}`;
}
