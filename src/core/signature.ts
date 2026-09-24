import { createHmac } from "node:crypto";
import type { ConfidentialSecret } from "./secret";

export function signCanonicalRequest(secret: ConfidentialSecret, canonicalRequest: string): string {
  const keyBytes = secret.keyBytes();
  try {
    return createHmac("sha256", keyBytes).update(canonicalRequest, "utf8").digest("hex");
  } finally {
    keyBytes.fill(0);
  }
}
