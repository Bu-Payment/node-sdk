import { describe, expect, it } from "vitest";
import { change, fakeCatalogue, movedTo, replacement } from "./support/price-replacement";

describe("price replacement product", () => {
  it("reports a failed archive with the product the move returned", async () => {
    const { client } = fakeCatalogue({ defaultPriceId: "price_1", failing: new Set([3]) });
    const result = await change(client).replace();
    expect(result).toMatchObject({
      outcome: "archive_failed",
      replacement,
      previousPriceId: "price_1",
      product: movedTo("price_2"),
    });
  });

  it("does not report a product when the move fails", async () => {
    const { client } = fakeCatalogue({ defaultPriceId: "price_1", failing: new Set([2]) });
    const result = await change(client).replace();
    expect(result.outcome).toBe("default_failed");
    expect(result).not.toHaveProperty("product");
  });
});
