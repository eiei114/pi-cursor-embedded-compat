import { protoBase64 } from "@bufbuild/protobuf";

export function encodeHeader(bytes) {
  return protoBase64.enc(bytes);
}
