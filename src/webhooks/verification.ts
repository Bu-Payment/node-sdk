import { createHmac, timingSafeEqual } from "node:crypto";
import { ErrorCode } from "../constants";
import { BuPaymentError } from "../errors";
import { parseWebhookEvent } from "./events";
import type {
  VerifiedWebhookDelivery,
  WebhookDeliveryInput,
  WebhookHeaderReader,
  WebhookHeaders,
} from "./types";

const DEFAULT_TOLERANCE_SECONDS = 300;
const ENDPOINT_SECRET = /^whsec_[A-Za-z0-9_-]{32,}$/u;

export const WebhookHeader = {
  ID: "x-webhook-id",
  TIMESTAMP: "x-webhook-timestamp",
  SIGNATURE: "x-webhook-signature",
} as const;

export function verifyWebhookDelivery(input: WebhookDeliveryInput): VerifiedWebhookDelivery {
  assertEndpointSecret(input.secret);
  const toleranceMs = toleranceMilliseconds(input.toleranceSeconds);
  const body = rawBody(input.body);
  const deliveryId = requiredHeader(input.headers, WebhookHeader.ID);
  const timestamp = requiredHeader(input.headers, WebhookHeader.TIMESTAMP);
  const signature = requiredHeader(input.headers, WebhookHeader.SIGNATURE);
  const expected = createHmac("sha256", input.secret)
    .update(`${timestamp}.`, "utf8")
    .update(body)
    .digest();
  if (!/^\d+$/u.test(timestamp) || !signatureMatches(signature, expected)) {
    throw new BuPaymentError("Webhook signature does not match the delivery", {
      code: ErrorCode.WEBHOOK_SIGNATURE_INVALID,
    });
  }
  const sentAt = Number(timestamp);
  if (Math.abs((input.now ?? Date.now)() - sentAt) > toleranceMs) {
    throw new BuPaymentError("Webhook timestamp is outside the accepted window", {
      code: ErrorCode.WEBHOOK_TIMESTAMP_EXPIRED,
      metadata: { toleranceSeconds: toleranceMs / 1000 },
    });
  }
  return {
    deliveryId,
    signature,
    timestamp: new Date(sentAt),
    event: parseWebhookEvent(parsePayload(body)),
  };
}

function assertEndpointSecret(secret: string): void {
  if (typeof secret !== "string" || !ENDPOINT_SECRET.test(secret)) {
    throw new BuPaymentError(
      "Webhook endpoint secret must be the whsec_ value issued for the endpoint",
      {
        code: ErrorCode.CONFIGURATION_INVALID,
      },
    );
  }
}

function rawBody(body: unknown): Uint8Array {
  if (typeof body === "string") {
    return Buffer.from(body, "utf8");
  }
  if (body instanceof Uint8Array) {
    return body;
  }
  throw new BuPaymentError(
    "Webhook body must be the raw request body as a string or bytes, not a parsed object",
    { code: ErrorCode.WEBHOOK_PAYLOAD_INVALID },
  );
}

function parsePayload(body: Uint8Array): Record<string, unknown> {
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body).toString("utf8"));
  } catch {
    payload = undefined;
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new BuPaymentError("Webhook body is not a JSON object", {
      code: ErrorCode.WEBHOOK_PAYLOAD_INVALID,
    });
  }
  return payload as Record<string, unknown>;
}

function toleranceMilliseconds(toleranceSeconds = DEFAULT_TOLERANCE_SECONDS): number {
  if (!Number.isFinite(toleranceSeconds) || toleranceSeconds <= 0) {
    throw new BuPaymentError("Webhook tolerance must be a positive number of seconds", {
      code: ErrorCode.CONFIGURATION_INVALID,
    });
  }
  return toleranceSeconds * 1000;
}

function requiredHeader(headers: WebhookHeaders, name: string): string {
  const value = headerValue(headers, name);
  if (value === undefined || value === "" || value.includes(",")) {
    throw new BuPaymentError(`Webhook delivery is missing a single ${name} header`, {
      code: ErrorCode.WEBHOOK_SIGNATURE_MISSING,
    });
  }
  return value;
}

function headerValue(headers: WebhookHeaders, name: string): string | undefined {
  if (isFetchHeaders(headers)) {
    return headers.get(name) ?? undefined;
  }
  const values = Object.entries(headers)
    .filter(([key]) => key.toLowerCase() === name)
    .flatMap(([, value]) => (value === undefined ? [] : [value].flat()));
  return values.length === 1 ? values[0] : undefined;
}

function isFetchHeaders(headers: WebhookHeaders): headers is WebhookHeaderReader {
  return typeof (headers as { get?: unknown }).get === "function";
}

function signatureMatches(signature: string, expected: Buffer): boolean {
  if (!/^[0-9a-f]{64}$/u.test(signature)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(signature, "hex"), expected);
}
