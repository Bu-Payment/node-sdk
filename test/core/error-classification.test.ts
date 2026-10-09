import { describe, expect, it } from "vitest";
import { ApiErrorCode, ErrorCode } from "../../src/constants";
import {
  BuPaymentError,
  isNotFound,
  isOutcomeUncertain,
  requiresHostedCheckout,
} from "../../src/errors";

function failure(
  code: ErrorCode,
  options: { status?: number; apiError?: string } = {},
): BuPaymentError {
  return new BuPaymentError("failed", {
    code,
    ...(options.status === undefined ? {} : { status: options.status }),
    ...(options.apiError === undefined ? {} : { metadata: { apiError: options.apiError } }),
  });
}

describe("BuPaymentError.apiError", () => {
  it("reads the API code the SDK has no code of its own for", () => {
    const error = failure(ErrorCode.OPERATION_FAILED, {
      status: 503,
      apiError: ApiErrorCode.CHECKOUT_UNAVAILABLE,
    });
    expect(error.apiError).toBe("checkout_unavailable");
  });

  it("is null when the API sent no separate code", () => {
    expect(failure(ErrorCode.RESOURCE_NOT_FOUND, { status: 404 }).apiError).toBeNull();
  });

  it("is null when the metadata holds something other than a string", () => {
    const error = new BuPaymentError("failed", {
      code: ErrorCode.OPERATION_FAILED,
      metadata: { apiError: 42 },
    });
    expect(error.apiError).toBeNull();
  });

  it("stays out of the serialisation, which already carries the metadata", () => {
    const error = failure(ErrorCode.OPERATION_FAILED, { status: 502, apiError: "x" });
    expect(error.toJSON()).toEqual({
      name: "BuPaymentError",
      code: ErrorCode.OPERATION_FAILED,
      status: 502,
      metadata: { apiError: "x" },
    });
  });
});

describe("isOutcomeUncertain", () => {
  it.each([
    ["the network failed", failure(ErrorCode.NETWORK_UNAVAILABLE)],
    ["the caller cancelled", failure(ErrorCode.REQUEST_CANCELLED)],
    ["the response was unreadable", failure(ErrorCode.RESPONSE_INVALID, { status: 200 })],
    ["the key was reused", failure(ErrorCode.IDEMPOTENCY_CONFLICT, { status: 409 })],
    [
      "the same key is still running",
      failure(ErrorCode.RESOURCE_CONFLICT, {
        status: 409,
        apiError: ApiErrorCode.IDEMPOTENCY_IN_PROGRESS,
      }),
    ],
    [
      "the first attempt's outcome is unknown",
      failure(ErrorCode.RESOURCE_CONFLICT, {
        status: 409,
        apiError: ApiErrorCode.IDEMPOTENCY_OUTCOME_UNKNOWN,
      }),
    ],
    ["the server failed", failure(ErrorCode.OPERATION_FAILED, { status: 500 })],
    ["the gateway timed out", failure(ErrorCode.OPERATION_FAILED, { status: 504 })],
    ["the API redirected the write", failure(ErrorCode.OPERATION_FAILED, { status: 302 })],
  ])("is true when %s", (_label, error) => {
    expect(isOutcomeUncertain(error)).toBe(true);
  });

  it.each([
    [
      "the checkout is unavailable",
      failure(ErrorCode.OPERATION_FAILED, {
        status: 503,
        apiError: ApiErrorCode.CHECKOUT_UNAVAILABLE,
      }),
    ],
    [
      "the provider refused the checkout",
      failure(ErrorCode.OPERATION_FAILED, {
        status: 502,
        apiError: ApiErrorCode.CHECKOUT_PROVIDER_FAILED,
      }),
    ],
    [
      "the financial preparation failed",
      failure(ErrorCode.OPERATION_FAILED, {
        status: 500,
        apiError: ApiErrorCode.FINANCIAL_PREPARATION_FAILED,
      }),
    ],
    ["the request was invalid", failure(ErrorCode.REQUEST_INVALID, { status: 400 })],
    ["the resource is unknown", failure(ErrorCode.RESOURCE_NOT_FOUND, { status: 404 })],
    ["the price changed", failure(ErrorCode.PRICE_CHANGED, { status: 409 })],
    ["the SDK refused before sending", failure(ErrorCode.REQUEST_INVALID)],
  ])("is false when %s", (_label, error) => {
    expect(isOutcomeUncertain(error)).toBe(false);
  });

  it("is false for anything that is not a BuPaymentError", () => {
    expect(isOutcomeUncertain(new Error("boom"))).toBe(false);
    expect(isOutcomeUncertain({ code: ErrorCode.NETWORK_UNAVAILABLE })).toBe(false);
    expect(isOutcomeUncertain(undefined)).toBe(false);
  });
});

describe("requiresHostedCheckout", () => {
  it("recognises a provider that cannot charge directly", () => {
    const error = failure(ErrorCode.OPERATION_FAILED, {
      status: 422,
      apiError: ApiErrorCode.PROVIDER_CAPABILITY_NOT_SUPPORTED,
    });
    expect(requiresHostedCheckout(error)).toBe(true);
  });

  it("ignores any other refusal", () => {
    expect(requiresHostedCheckout(failure(ErrorCode.REQUEST_INVALID, { status: 422 }))).toBe(false);
    expect(requiresHostedCheckout(new Error("provider_capability_not_supported"))).toBe(false);
  });
});

describe("isNotFound", () => {
  it("recognises an unknown resource", () => {
    expect(isNotFound(failure(ErrorCode.RESOURCE_NOT_FOUND, { status: 404 }))).toBe(true);
  });

  it("ignores any other failure", () => {
    expect(isNotFound(failure(ErrorCode.OPERATION_FAILED, { status: 500 }))).toBe(false);
    expect(isNotFound({ status: 404 })).toBe(false);
  });
});
