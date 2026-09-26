import { describe, expect, it } from "vitest";
import { ErrorCode } from "../../src/constants";
import { BuPaymentError } from "../../src/errors";

describe("BuPaymentError", () => {
  it("carries the code, status, and request ID without the cause", () => {
    const cause = new Error("socket closed");
    const error = new BuPaymentError("BuPayment request failed", {
      code: ErrorCode.APPLICATION_AUTH_INVALID,
      status: 401,
      requestId: "req_1",
      cause,
    });
    expect(error.name).toBe("BuPaymentError");
    expect(error.cause).toBe(cause);
    expect(error.toJSON()).toEqual({
      name: "BuPaymentError",
      code: ErrorCode.APPLICATION_AUTH_INVALID,
      status: 401,
      requestId: "req_1",
    });
  });

  it("omits absent fields from its serialisation", () => {
    const error = new BuPaymentError("Configuration is invalid", {
      code: ErrorCode.CONFIGURATION_INVALID,
    });
    expect(error.toJSON()).toEqual({
      name: "BuPaymentError",
      code: ErrorCode.CONFIGURATION_INVALID,
    });
  });

  it("serialises the resource only when the API sent one", () => {
    const resource = { id: "prod_1", updatedAt: "2026-01-01T00:00:00.000Z" };
    const error = new BuPaymentError("stale", {
      code: ErrorCode.STALE_RESOURCE,
      status: 409,
      resource,
    });
    expect(error.resource).toBe(resource);
    expect(error.toJSON()).toEqual({
      name: "BuPaymentError",
      code: ErrorCode.STALE_RESOURCE,
      status: 409,
      resource,
    });
  });
});
