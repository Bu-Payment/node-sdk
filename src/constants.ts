export const SIGNATURE_VERSION = "1";

export const SIGNATURE_ALGORITHM = "BUPAYMENT-HMAC-SHA256-V1";

export const Header = {
  SIGNATURE_VERSION: "Bu-Payment-Signature-Version",
  APP_ID: "Bu-Payment-App-Id",
  KEY_ID: "Bu-Payment-Key-Id",
  TIMESTAMP: "Bu-Payment-Timestamp",
  NONCE: "Bu-Payment-Nonce",
  SIGNATURE: "Bu-Payment-Signature",
  IDEMPOTENCY_KEY: "Idempotency-Key",
  REQUEST_ID: "X-Request-ID",
  RETRY_AFTER: "Retry-After-application",
} as const;

export const ErrorCode = {
  CONFIGURATION_INVALID: "configuration_invalid",
  NETWORK_UNAVAILABLE: "network_unavailable",
  REQUEST_CANCELLED: "request_cancelled",
  RESPONSE_INVALID: "response_invalid",
  REQUEST_INVALID: "request_invalid",
  RESOURCE_NOT_FOUND: "resource_not_found",
  RESOURCE_CONFLICT: "resource_conflict",
  STALE_RESOURCE: "stale_resource",
  LOOKUP_KEY_CONFLICT: "lookup_key_conflict",
  IDEMPOTENCY_CONFLICT: "idempotency_conflict",
  APPLICATION_AUTH_REQUIRED: "application_auth_required",
  APPLICATION_AUTH_MALFORMED: "application_auth_malformed",
  APPLICATION_AUTH_VERSION_UNSUPPORTED: "application_auth_version_unsupported",
  APPLICATION_AUTH_EXPIRED: "application_auth_expired",
  APPLICATION_AUTH_REPLAYED: "application_auth_replayed",
  APPLICATION_AUTH_INVALID: "application_auth_invalid",
  APPLICATION_CAPABILITY_DENIED: "application_capability_denied",
  TOO_MANY_REQUESTS: "too_many_requests",
  APPLICATION_AUTH_UNAVAILABLE: "application_auth_unavailable",
  OPERATION_FAILED: "operation_failed",
  WEBHOOK_SIGNATURE_MISSING: "webhook_signature_missing",
  WEBHOOK_SIGNATURE_INVALID: "webhook_signature_invalid",
  WEBHOOK_TIMESTAMP_EXPIRED: "webhook_timestamp_expired",
  WEBHOOK_PAYLOAD_INVALID: "webhook_payload_invalid",
  WEBHOOK_EVENT_VERSION_UNSUPPORTED: "webhook_event_version_unsupported",
  WEBHOOK_EVENT_INVALID: "webhook_event_invalid",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
