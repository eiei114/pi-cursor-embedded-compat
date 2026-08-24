export const PATCH_ACTIONS = [
  "patched",
  "already_patched",
  "upstream_fixed",
  "not_applicable",
] as const;

export type PatchAction = (typeof PATCH_ACTIONS)[number];

export const PATCH_FAILURE_CODES = [
  "resolution_failed",
  "unsupported_graph",
  "read_failed",
  "signature_mismatch",
  "write_failed",
  "verify_failed",
] as const;

export type PatchFailureCode = (typeof PATCH_FAILURE_CODES)[number];

export interface DependencyGraph {
  piCursorSdk: string;
  cursorSdk: string;
  connect: string;
  protobuf: string;
}

export interface SupportEntry {
  id: string;
  graph: DependencyGraph;
  targetPackage: "@connectrpc/connect";
  targetRelativePath: string;
  failureSignature: string;
  replacement: string;
  safeSignatures: readonly string[];
  originalSha256: string;
  patchedSha256: string;
}

export interface PatchSuccess {
  ok: true;
  action: PatchAction;
  entryId: string;
  targetRelativePath: string;
  graph: DependencyGraph;
  observedSha256: string;
  finalSha256: string;
}

export interface PatchFailure {
  ok: false;
  code: PatchFailureCode;
  entryId?: string;
  targetRelativePath?: string;
  graph?: DependencyGraph;
  observedSha256?: string;
  message: string;
}

export type PatchResult = PatchSuccess | PatchFailure;

export interface ResolvedTarget {
  entry: SupportEntry;
  targetPath: string;
  graph: DependencyGraph;
}

export interface ResolutionSuccess extends ResolvedTarget {
  ok: true;
}

export interface ResolutionFailure {
  ok: false;
  code: "resolution_failed" | "unsupported_graph";
  graph?: DependencyGraph;
  message: string;
}

export type ResolutionResult = ResolutionSuccess | ResolutionFailure;
