import { ErrorCode } from "../constants";
import { BuPaymentError } from "../errors";

const SCOPE_KEYS = new Set([
  "workspaceid",
  "environmentid",
  "applicationid",
  "appid",
  "tenantid",
  "provider",
  "provideraccountid",
  "provideraccountversion",
]);

const MAX_DEPTH = 6;

export function assertNoScopeOverrides(body: unknown): void {
  walk(body, MAX_DEPTH);
}

function walk(value: unknown, depth: number): void {
  if (depth === 0 || value === null || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      walk(item, depth - 1);
    }
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (SCOPE_KEYS.has(key.toLowerCase())) {
      throw scopeOverride(key);
    }
    walk(nested, depth - 1);
  }
}

function scopeOverride(key: string): BuPaymentError {
  return new BuPaymentError(
    `Request body must not carry "${key}": the authenticated credential fixes the scope`,
    { code: ErrorCode.REQUEST_INVALID, metadata: { field: key } },
  );
}
