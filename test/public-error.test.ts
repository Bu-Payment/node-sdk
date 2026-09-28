import { describe, expect, it } from "vitest";
import { ErrorCode } from "../src/constants";
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
