import { randomBytes } from "node:crypto";

const NONCE_BYTES = 16;

export function generateNonce(): string {
  return randomBytes(NONCE_BYTES).toString("hex");
}
