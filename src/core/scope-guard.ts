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

const NO_FIELDS: ReadonlySet<string> = new Set();

const ROUTE_BODY_FIELDS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["POST /v1/checkouts", new Set(["provider"])],
]);

export function routeBodyFields(method: string, path: string): ReadonlySet<string> {
  return ROUTE_BODY_FIELDS.get(`${method.toUpperCase()} ${path}`) ?? NO_FIELDS;
}

export function assertNoScopeOverrides(
  value: unknown,
  allowedTopLevel: ReadonlySet<string> = NO_FIELDS,
): void {
  walk(value, new WeakSet<object>(), allowedTopLevel);
}

function walk(value: unknown, visited: WeakSet<object>, allowed: ReadonlySet<string>): void {
  if (value === null || typeof value !== "object" || visited.has(value)) {
    return;
  }
  visited.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      walk(item, visited, NO_FIELDS);
    }
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (!allowed.has(key) && SCOPE_KEYS.has(normalizeKey(key))) {
      throw scopeOverride(key);
    }
    walk(nested, visited, NO_FIELDS);
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
