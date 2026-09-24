import { ErrorCode } from "../constants";
import { BuPaymentError } from "../errors";

export type QueryValue = string | number | boolean;
export type QueryInput = Readonly<Record<string, QueryValue | readonly QueryValue[] | undefined>>;

export interface RequestTarget {
  url: string;
  rawPath: string;
  rawQuery: string;
}

const UNRESERVED = /^[A-Za-z0-9\-._~]$/u;

export function buildRequestTarget(
  apiBaseUrl: URL,
  path: string,
  query?: QueryInput,
): RequestTarget {
  if (!path.startsWith("/")) {
    throw invalidTarget("Request path must start with a slash");
  }
  const rawPath = joinPath(apiBaseUrl.pathname, path);
  const rawQuery = buildRawQuery(query);
  return {
    url: `${apiBaseUrl.origin}${rawPath}${rawQuery === "" ? "" : `?${rawQuery}`}`,
    rawPath,
    rawQuery,
  };
}

export function encodePathSegment(value: string): string {
  if (value === "") {
    throw invalidTarget("Path segment must not be empty");
  }
  return percentEncode(value);
}

function joinPath(basePathname: string, path: string): string {
  const base = basePathname.endsWith("/") ? basePathname.slice(0, -1) : basePathname;
  return `${base}${path}`;
}

function buildRawQuery(query?: QueryInput): string {
  if (query === undefined) {
    return "";
  }
  const pairs: string[] = [];
  for (const [name, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    for (const item of Array.isArray(value) ? value : [value as QueryValue]) {
      pairs.push(`${percentEncode(name)}=${percentEncode(String(item))}`);
    }
  }
  return pairs.join("&");
}

function percentEncode(value: string): string {
  let encoded = "";
  for (const character of value) {
    if (UNRESERVED.test(character)) {
      encoded += character;
      continue;
    }
    for (const byte of Buffer.from(character, "utf8")) {
      encoded += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return encoded;
}

function invalidTarget(message: string): BuPaymentError {
  return new BuPaymentError(message, { code: ErrorCode.REQUEST_INVALID });
}
