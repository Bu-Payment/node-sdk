import { describe, expect, it } from "vitest";
import { ApiErrorCode, ErrorCode } from "../../src/constants";
import {
  BuPaymentError,
  isNotFound,
  isOutcomeUncertain,
  needsReconciliation,
  requiresHostedCheckout,
} from "../../src/errors";
import * as sdk from "../../src/index";
import { harnessOf, json } from "../support/harness";

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
    [
      "the checkout is unavailable",
      failure(ErrorCode.OPERATION_FAILED, {
        status: 503,
        apiError: ApiErrorCode.CHECKOUT_UNAVAILABLE,
      }),
    ],
    [
      "the provider failed the checkout",
      failure(ErrorCode.OPERATION_FAILED, {
        status: 502,
        apiError: ApiErrorCode.CHECKOUT_PROVIDER_FAILED,
      }),
    ],
    [
      "the server failed with a code the SDK does not know",
      failure(ErrorCode.OPERATION_FAILED, { status: 503, apiError: "something_new" }),
    ],
  ])("is true when %s", (_label, error) => {
    expect(isOutcomeUncertain(error)).toBe(true);
  });

  it.each([
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

  it("lets a definite refusal win over an uncertain code", () => {
    const error = failure(ErrorCode.NETWORK_UNAVAILABLE, {
      apiError: ApiErrorCode.FINANCIAL_PREPARATION_FAILED,
    });
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

describe("needsReconciliation", () => {
  it.each([
    ["a key reused for another request", failure(ErrorCode.IDEMPOTENCY_CONFLICT, { status: 409 })],
    [
      "an outcome the API lost",
      failure(ErrorCode.RESOURCE_CONFLICT, {
        status: 409,
        apiError: ApiErrorCode.IDEMPOTENCY_OUTCOME_UNKNOWN,
      }),
    ],
  ])("is true for %s, which a retry cannot settle", (_label, error) => {
    expect(needsReconciliation(error)).toBe(true);
    expect(isOutcomeUncertain(error)).toBe(true);
  });

  it.each([
    ["a network failure", failure(ErrorCode.NETWORK_UNAVAILABLE)],
    [
      "the same key still running",
      failure(ErrorCode.RESOURCE_CONFLICT, {
        status: 409,
        apiError: ApiErrorCode.IDEMPOTENCY_IN_PROGRESS,
      }),
    ],
    ["a server failure", failure(ErrorCode.OPERATION_FAILED, { status: 503 })],
    ["a plain error", new Error("idempotency_conflict")],
  ])("is false for %s", (_label, error) => {
    expect(needsReconciliation(error)).toBe(false);
  });
});

describe("classifying an answer the API sent", () => {
  async function refusalOf(status: number, body: unknown): Promise<unknown> {
    const { client } = harnessOf(() => json(body, status));
    return await client
      .request({ method: "POST", path: "/v1/payments" })
      .catch((caught: unknown) => caught);
  }

  it("recognises a provider that cannot charge directly from its envelope", async () => {
    const error = await refusalOf(422, { error: "provider_capability_not_supported" });
    expect(requiresHostedCheckout(error)).toBe(true);
    expect(isOutcomeUncertain(error)).toBe(false);
  });

  it("recognises an unknown resource from its envelope", async () => {
    expect(isNotFound(await refusalOf(404, { error: "resource_not_found" }))).toBe(true);
  });

  it("reads an unavailable checkout from its envelope as uncertain", async () => {
    const error = await refusalOf(503, { error: "checkout_unavailable" });
    expect(error).toMatchObject({ apiError: "checkout_unavailable" });
    expect(isOutcomeUncertain(error)).toBe(true);
  });
});

describe("the package entry point", () => {
  it("exports the classification guards and the API codes", () => {
    expect(sdk.ApiErrorCode).toBe(ApiErrorCode);
    expect(sdk.isOutcomeUncertain).toBe(isOutcomeUncertain);
    expect(sdk.needsReconciliation).toBe(needsReconciliation);
    expect(sdk.requiresHostedCheckout).toBe(requiresHostedCheckout);
    expect(sdk.isNotFound).toBe(isNotFound);
  });
});
