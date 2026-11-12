import { describe, expect, it } from "vitest";
import { ApiErrorCode, ErrorCode } from "../src/constants";
import { BuPaymentError } from "../src/errors";
import { publicError } from "../src/public-error";
import { harnessOf } from "./support/harness";

const leaky = "the confidential secret for key_1 did not match";

describe("publicError", () => {
  it.each([
    [400, 400],
    [499, 499],
    [500, 500],
    [399, 502],
    [409, 409],
    [404, 404],
    [503, 503],
    [599, 599],
    [200, 502],
    [302, 502],
    [600, 502],
    [undefined, 502],
  ])("answers an SDK error with status %s as %s", (status, expected) => {
    const error = new BuPaymentError(leaky, {
      code: ErrorCode.RESOURCE_CONFLICT,
      ...(status === undefined ? {} : { status }),
    });
    expect(publicError(error).status).toBe(expected);
  });

  it("keeps the canonical code and replaces the API message", () => {
    const view = publicError(
      new BuPaymentError(leaky, { code: ErrorCode.PRICE_CHANGED, status: 409, requestId: "req_1" }),
    );
    expect(view).toEqual({
      status: 409,
      code: ErrorCode.PRICE_CHANGED,
      message: "The payment could not be completed.",
    });
  });

  it.each([
    [ErrorCode.CONFIGURATION_INVALID, undefined],
    [ErrorCode.CONFIGURATION_MISSING, undefined],
    [ErrorCode.APPLICATION_AUTH_REQUIRED, 401],
    [ErrorCode.APPLICATION_AUTH_MALFORMED, 401],
    [ErrorCode.APPLICATION_AUTH_VERSION_UNSUPPORTED, 401],
    [ErrorCode.APPLICATION_AUTH_EXPIRED, 401],
    [ErrorCode.APPLICATION_AUTH_REPLAYED, 401],
    [ErrorCode.APPLICATION_AUTH_INVALID, 401],
    [ErrorCode.APPLICATION_AUTH_UNAVAILABLE, 503],
    [ErrorCode.APPLICATION_CAPABILITY_DENIED, 403],
  ])("answers the merchant's own %s as a gateway failure", (code, status) => {
    const view = publicError(
      new BuPaymentError(leaky, { code, ...(status === undefined ? {} : { status }) }),
    );
    expect(view).toEqual({
      status: 502,
      code: ErrorCode.OPERATION_FAILED,
      message: "The payment could not be completed.",
    });
  });

  it.each([
    ["no body", 401, ""],
    ["no body", 403, ""],
    ["a proxy page", 401, "<html>Unauthorized</html>"],
    ["a proxy page", 403, "<html>Forbidden</html>"],
    ["a code foreign to the SDK", 401, JSON.stringify({ error: "Unauthorized" })],
    ["a code foreign to the SDK", 403, JSON.stringify({ error: "app_access_denied" })],
  ])("hides a refused credential answering %s with %s", async (_shape, status, body) => {
    const { client } = harnessOf(() => new Response(body, { status }));
    const failure = await client.payments
      .payment("pay_1")
      .get()
      .catch((error: unknown) => error);
    expect(publicError(failure)).toEqual({
      status: 502,
      code: ErrorCode.OPERATION_FAILED,
      message: "The payment could not be completed.",
    });
  });

  it.each([
    [ApiErrorCode.PAYMENT_METHOD_UNUSABLE],
    [ApiErrorCode.PAYMENT_METHOD_REPLACEMENT_INVALID],
  ])("keeps the status of the documented refusal %s", async (apiError) => {
    const { client } = harnessOf(() => Response.json({ error: apiError }, { status: 403 }));
    const failure = await client.payments
      .payment("pay_1")
      .get()
      .catch((error: unknown) => error);
    expect(publicError(failure)).toEqual({
      status: 403,
      code: ErrorCode.OPERATION_FAILED,
      message: "The payment could not be completed.",
    });
  });

  it.each([
    [400],
    [402],
    [422],
    [500],
    [503],
  ])("keeps the status of an operation failure answering %s", (status) => {
    const view = publicError(
      new BuPaymentError(leaky, { code: ErrorCode.OPERATION_FAILED, status }),
    );
    expect(view).toEqual({
      status,
      code: ErrorCode.OPERATION_FAILED,
      message: "The payment could not be completed.",
    });
  });

  it("keeps the status of an SDK code answering 403", () => {
    const view = publicError(
      new BuPaymentError(leaky, { code: ErrorCode.RESOURCE_CONFLICT, status: 403 }),
    );
    expect(view).toEqual({
      status: 403,
      code: ErrorCode.RESOURCE_CONFLICT,
      message: "The payment could not be completed.",
    });
  });

  it.each([
    [new Error(leaky)],
    [leaky],
    [undefined],
    [{ status: 404 }],
  ])("answers anything else as an operation failure", (error) => {
    expect(publicError(error)).toEqual({
      status: 500,
      code: ErrorCode.OPERATION_FAILED,
      message: "The request could not be completed.",
    });
  });

  it("maps a malformed success response to a gateway failure", async () => {
    const { client } = harnessOf(() => new Response("not json", { status: 200 }));
    const failure = await client.payments
      .payment("pay_1")
      .get()
      .catch((error: unknown) => error);
    expect(publicError(failure)).toEqual({
      status: 502,
      code: ErrorCode.RESPONSE_INVALID,
      message: "The payment could not be completed.",
    });
  });
});
