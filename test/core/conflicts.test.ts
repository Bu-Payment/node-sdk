import { describe, expect, it } from "vitest";
import { ErrorCode } from "../../src/constants";
import { BuPaymentError } from "../../src/errors";
import { harnessOf, json } from "../support/harness";

const current = { id: "prod_1", name: "Gold", updatedAt: "2026-01-02T00:00:00.000Z" };

async function failureOf(body: unknown): Promise<BuPaymentError> {
  const { client } = harnessOf(() => json(body, 409));
  const failure = await client
    .request({ method: "POST", path: "/v1/products/prod_1/archive" })
    .catch((caught: unknown) => caught);
  expect(failure).toBeInstanceOf(BuPaymentError);
  return failure as BuPaymentError;
}

describe("conflict responses", () => {
  it("gives a stale write its own code and the current resource", async () => {
    const error = await failureOf({ error: "stale_resource", message: "stale", resource: current });
    expect(error.code).toBe(ErrorCode.STALE_RESOURCE);
    expect(error.status).toBe(409);
    expect(error.resource).toEqual(current);
    expect(error.metadata).toBeUndefined();
    expect(error.toJSON()).toMatchObject({ resource: current });
  });

  it("carries a lookup key holder only when the API names it", async () => {
    const named = await failureOf({ error: "lookup_key_conflict", resource: current });
    const hidden = await failureOf({ error: "lookup_key_conflict" });
    expect(named.code).toBe(ErrorCode.LOOKUP_KEY_CONFLICT);
    expect(named.resource).toEqual(current);
    expect(hidden.code).toBe(ErrorCode.LOOKUP_KEY_CONFLICT);
    expect(hidden.resource).toBeUndefined();
    expect(hidden.toJSON()).not.toHaveProperty("resource");
  });

  it("gives a reused idempotency key its own code without a resource", async () => {
    const error = await failureOf({ error: "idempotency_conflict", resource: current });
    expect(error.code).toBe(ErrorCode.IDEMPOTENCY_CONFLICT);
    expect(error.metadata).toBeUndefined();
    expect(error.resource).toBeUndefined();
  });

  it.each([
    [{ id: "prod_1" }],
    [{ updatedAt: "2026-01-02T00:00:00.000Z" }],
    [null],
    [[current]],
    ["prod_1"],
  ])("drops a resource the API sent in an undocumented shape: %j", async (resource) => {
    const error = await failureOf({ error: "stale_resource", resource });
    expect(error.code).toBe(ErrorCode.STALE_RESOURCE);
    expect(error.resource).toBeUndefined();
  });

  it.each([
    ["default_price_in_use", ErrorCode.DEFAULT_PRICE_IN_USE],
    ["default_price_not_owned", ErrorCode.DEFAULT_PRICE_NOT_OWNED],
    ["price_product_mismatch", ErrorCode.PRICE_PRODUCT_MISMATCH],
    ["invalid_state", ErrorCode.INVALID_STATE],
  ])("gives the %s catalogue refusal its own code without a resource", async (apiError, code) => {
    const error = await failureOf({ error: apiError, resource: current });
    expect(error.code).toBe(code);
    expect(error.metadata).toBeUndefined();
    expect(error.resource).toBeUndefined();
  });

  it("keeps any other conflict as a resource conflict", async () => {
    const error = await failureOf({ error: "cross_sell_exists", resource: current });
    expect(error.code).toBe(ErrorCode.RESOURCE_CONFLICT);
    expect(error.metadata).toEqual({ apiError: "cross_sell_exists" });
    expect(error.resource).toBeUndefined();
  });
});
