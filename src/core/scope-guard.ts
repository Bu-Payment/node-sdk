import { ErrorCode } from "../constants";
import { BuPaymentError } from "../errors";

const SCOPE_KEYS = new Set([
  "workspace",
  "workspaceid",
  "environment",
  "environmentid",
  "application",
  "applicationid",
  "app",
  "appid",
  "tenant",
  "tenantid",
  "provider",
  "provideraccountid",
  "provideraccountversion",
]);

export function assertNoScopeOverrides(value: unknown): void {
  walk(value, new WeakSet<object>());
}

function walk(value: unknown, visited: WeakSet<object>): void {
  if (value === null || typeof value !== "object" || visited.has(value)) {
    return;
  }
  visited.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      walk(item, visited);
    }
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (SCOPE_KEYS.has(normalizeKey(key))) {
      throw scopeOverride(key);
    }
    walk(nested, visited);
  }
}

function normalizeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9]/gu, "").toLowerCase();
}

function scopeOverride(key: string): BuPaymentError {
  return new BuPaymentError(
    `Request must not carry "${key}": the authenticated credential fixes the scope`,
    { code: ErrorCode.REQUEST_INVALID, metadata: { field: key } },
  );
}
