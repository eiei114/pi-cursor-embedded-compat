import type { SupportEntry } from "./contracts.ts";

const PROTOBUF_NAMESPACE_IMPORT = 'import * as protobufModule from "@bufbuild/protobuf";';

/**
 * `@connectrpc/connect` 1.7.0 ships the same `dist/esm/http-headers.js` for every
 * Cursor SDK graph that embeds it, so one verified transform covers each graph.
 * Keep the transform shared: a per-graph copy would let the hash contract drift
 * silently between registry entries.
 */
const CONNECT_1_7_0_TRANSFORM = {
  targetPackage: "@connectrpc/connect",
  targetRelativePath: "dist/esm/http-headers.js",
  failureSignature: 'import { protoBase64 } from "@bufbuild/protobuf";',
  replacement: `${PROTOBUF_NAMESPACE_IMPORT}\nconst protoBase64 = protobufModule.protoBase64 ?? protobufModule.default?.protoBase64;`,
  safeSignatures: [PROTOBUF_NAMESPACE_IMPORT],
  originalSha256: "6ab4063f8d28e1508cbf7dae4c508c9ace94d145d51dd127832d3266d8489dc8",
  patchedSha256: "e1c96a4af7b9470cc2b7bceabae4deb0f26f73c81b12f8654944d54d5642f1bc",
} as const satisfies Omit<SupportEntry, "id" | "graph">;

export const SUPPORT_REGISTRY = [
  {
    id: "connect-1.7.0-pi-cursor-sdk-0.2.0",
    graph: {
      piCursorSdk: "0.2.0",
      cursorSdk: "1.0.23",
      connect: "1.7.0",
      protobuf: "1.10.0",
    },
    ...CONNECT_1_7_0_TRANSFORM,
  },
  {
    id: "connect-1.7.0-pi-cursor-sdk-0.3.6",
    graph: {
      piCursorSdk: "0.3.6",
      cursorSdk: "1.0.31",
      connect: "1.7.0",
      protobuf: "1.10.0",
    },
    ...CONNECT_1_7_0_TRANSFORM,
  },
] satisfies readonly SupportEntry[];

export type RegisteredSupportEntry = (typeof SUPPORT_REGISTRY)[number];
