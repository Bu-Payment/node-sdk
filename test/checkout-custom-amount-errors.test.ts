import { describe, expect, it } from "vitest";
import { ApiErrorCode, ErrorCode } from "../src/constants";
import { BuPaymentError, isCustomAmountRefused, isOutcomeUncertain } from "../src/errors";
import * as sdk from "../src/index";
import { publicError } from "../src/public-error";
import { harnessOf, json } from "./support/harness";

async function refusalOf(apiError: string, status: number): Promise<BuPaymentError> {
  const { client } = harnessOf(() =>
    json({ error: apiError, message: "refused", statusCode: status }, status),
  );
  const pending = client.checkout
    .sessionDraft()
    .amount(12_100)
    .currency("EUR")
    .description("Room 12, 3 nights")
    .customerId("customer_1")
    .destination("default")
    .provider("stripe")
    .idempotencyKey("booking-7")
    .create();
  const error = await pending.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(BuPaymentError);
  return error as BuPaymentError;
}

describe("custom amount refusals", () => {
  it.each([
    [ApiErrorCode.CHECKOUT_CUSTOM_AMOUNT_NOT_ALLOWED, 403, ErrorCode.OPERATION_FAILED],
    [ApiErrorCode.CHECKOUT_CUSTOM_AMOUNT_UNSUPPORTED_PROVIDER, 409, ErrorCode.RESOURCE_CONFLICT],
  ])("maps %s to its generic code with the API code kept", async (apiError, status, code) => {
    const error = await refusalOf(apiError, status);
    expect(error.code).toBe(code);
    expect(error.status).toBe(status);
    expect(error.apiError).toBe(apiError);
    expect(isCustomAmountRefused(error)).toBe(true);
    expect(isOutcomeUncertain(error)).toBe(false);
  });

  it.each([
    [ApiErrorCode.CHECKOUT_CUSTOM_AMOUNT_NOT_ALLOWED, 403],
    [ApiErrorCode.CHECKOUT_CUSTOM_AMOUNT_UNSUPPORTED_PROVIDER, 409],
  ])("answers the browser for %s as a merchant failure", async (apiError, status) => {
    expect(publicError(await refusalOf(apiError, status))).toEqual({
      status: 502,
      code: ErrorCode.OPERATION_FAILED,
      message: "The payment could not be completed.",
    });
  });

  it("recognises neither a neighbouring checkout refusal nor a value that is not an SDK error", async () => {
    const live = await refusalOf(ApiErrorCode.CHECKOUT_LIVE_NOT_ENABLED, 409);
    expect(isCustomAmountRefused(live)).toBe(false);
    expect(publicError(live).status).toBe(409);
    expect(isCustomAmountRefused(new Error(ApiErrorCode.CHECKOUT_CUSTOM_AMOUNT_NOT_ALLOWED))).toBe(
      false,
    );
    expect(isCustomAmountRefused(null)).toBe(false);
  });

  it("is exported from the package entry point", () => {
    expect(sdk.isCustomAmountRefused).toBe(isCustomAmountRefused);
  });
});
