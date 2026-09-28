import { describe, expect, it } from "vitest";
import { ErrorCode } from "../../src/constants";
import { BuPaymentError, isPriceChanged } from "../../src/errors";

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

describe("isPriceChanged", () => {
  const current = {
    id: "price_1",
    unitAmount: 1_900,
    currency: "EUR",
    active: true,
    updatedAt: "2026-09-26T12:00:00.000Z",
  };

  it("recognises a price_changed refusal carrying the current price", () => {
    const error = new BuPaymentError("changed", {
      code: ErrorCode.PRICE_CHANGED,
      status: 409,
      price: current,
    });
    expect(isPriceChanged(error)).toBe(true);
    expect(error.price).toEqual(current);
  });

  it("recognises a price_changed refusal whose envelope carried no price", () => {
    const error = new BuPaymentError("changed", { code: ErrorCode.PRICE_CHANGED, status: 409 });
    expect(isPriceChanged(error)).toBe(true);
    expect(error.price).toBeUndefined();
  });

  it("rejects a BuPaymentError with another code", () => {
    const error = new BuPaymentError("conflict", {
      code: ErrorCode.RESOURCE_CONFLICT,
      status: 409,
      price: current,
    });
    expect(isPriceChanged(error)).toBe(false);
  });

  it.each([
    ["a plain error", new Error("price_changed")],
    ["a lookalike object", { name: "BuPaymentError", code: "price_changed", price: current }],
    ["a string", "price_changed"],
    ["undefined", undefined],
    ["null", null],
  ])("rejects %s", (_, value) => {
    expect(isPriceChanged(value)).toBe(false);
  });
});
