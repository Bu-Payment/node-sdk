import { describe, expect, it } from "vitest";
import type { Product } from "../src/catalogue/types";
import { ErrorCode, Header } from "../src/constants";
import { callAt, harnessOf, harnessReturning, json, pathOf } from "./support/harness";

const product = { id: "prod_1", defaultPriceId: "price_2", updatedAt: "2026-01-03T00:00:00Z" };

describe("setting a product's default price", () => {
  it("puts the selected price as the default and answers the product", async () => {
    const { client, calls } = harnessReturning(product);
    const result: Product = await client.catalogue
      .setDefaultPrice("prod_1")
      .priceId("price_2")
      .expectedUpdatedAt("2026-01-02T00:00:00Z")
      .update();
    expect(result).toEqual(product);
    expect(callAt(calls, 0).method).toBe("PUT");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/products/prod_1/default-price");
    expect(callAt(calls, 0).body).toEqual({
      priceId: "price_2",
      expectedUpdatedAt: "2026-01-02T00:00:00Z",
    });
  });

  it("sends only the price when no version is asserted", async () => {
    const { client, calls } = harnessReturning(product);
    await client.catalogue.setDefaultPrice("prod_1").priceId("price_2").update();
    expect(callAt(calls, 0).body).toEqual({ priceId: "price_2" });
  });

  it("replays under the same key when the same builder is retried", async () => {
    const { client, calls } = harnessOf((_call, index) =>
      index === 0 ? json({ error: "operation_failed" }, 503) : json(product),
    );
    const change = client.catalogue.setDefaultPrice("prod_1").priceId("price_2");
    await expect(change.update()).rejects.toMatchObject({ code: ErrorCode.OPERATION_FAILED });
    await change.timeoutMs(5_000).update();
    expect(callAt(calls, 1).headers[Header.IDEMPOTENCY_KEY]).toBe(
      callAt(calls, 0).headers[Header.IDEMPOTENCY_KEY],
    );
  });

  it("takes a new key when the body changes", async () => {
    const { client, calls } = harnessReturning(product, product);
    const change = client.catalogue.setDefaultPrice("prod_1").priceId("price_2");
    await change.update();
    await change.expectedUpdatedAt("2026-01-02T00:00:00Z").update();
    expect(callAt(calls, 1).headers[Header.IDEMPOTENCY_KEY]).not.toBe(
      callAt(calls, 0).headers[Header.IDEMPOTENCY_KEY],
    );
  });

  it("sends the caller's key as given", async () => {
    const { client, calls } = harnessReturning(product);
    await client.catalogue
      .setDefaultPrice("prod_1")
      .priceId("price_2")
      .idempotencyKey("default-gold")
      .update();
    expect(callAt(calls, 0).headers[Header.IDEMPOTENCY_KEY]).toBe("default-gold");
  });

  it.each([
    ["default_price_not_owned", ErrorCode.DEFAULT_PRICE_NOT_OWNED],
    ["price_product_mismatch", ErrorCode.PRICE_PRODUCT_MISMATCH],
    ["invalid_state", ErrorCode.INVALID_STATE],
  ])("gives the %s refusal its own code", async (apiError, code) => {
    const { client } = harnessOf(() => json({ error: apiError }, 409));
    await expect(
      client.catalogue.setDefaultPrice("prod_1").priceId("price_2").update(),
    ).rejects.toMatchObject({ code, status: 409 });
  });

  it("refuses an empty product inside the terminal, not at the entry", async () => {
    const { client, calls } = harnessReturning(product);
    const change = client.catalogue.setDefaultPrice("").priceId("price_2");
    await expect(change.update()).rejects.toMatchObject({ code: ErrorCode.REQUEST_INVALID });
    expect(calls).toHaveLength(0);
  });
});
