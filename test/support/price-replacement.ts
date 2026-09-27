import type { Price, Product } from "../../src/catalogue/types";
import { type Call, harnessOf, type harnessReturning, json, pathOf } from "./harness";

export const productUpdatedAt = "2026-01-02T00:00:00.000Z";

export const replacement = { id: "price_2", unitAmount: 1_200 } as Price;
export const archived = { id: "price_1", active: false, updatedAt: productUpdatedAt } as Price;
export const productVersion = "2026-01-05T00:00:00.000Z";
export const withDefault = (defaultPriceId: string | null) =>
  ({ id: "prod_1", defaultPriceId, updatedAt: productVersion }) as Product;
const movedVersion = "2026-01-06T00:00:00.000Z";
export const movedTo = (defaultPriceId: string) =>
  ({ ...withDefault(defaultPriceId), updatedAt: movedVersion }) as Product;

export const routeOf = (call: Call) => `${call.method} ${pathOf(call)}`;

export function fakeCatalogue(options: { defaultPriceId: string | null; failing?: Set<number> }) {
  let defaultPriceId = options.defaultPriceId;
  return harnessOf((call, index) => {
    if (options.failing?.has(index) === true) {
      return json({ error: "operation_failed" }, 503);
    }
    const route = routeOf(call);
    if (route === "GET /v1/products/prod_1") {
      return json(withDefault(defaultPriceId));
    }
    if (route === "POST /v1/products/prod_1/prices") {
      return json(replacement);
    }
    if (route === "PUT /v1/products/prod_1/default-price") {
      defaultPriceId = (call.body as { priceId: string }).priceId;
      return json(movedTo(defaultPriceId));
    }
    if (route === "POST /v1/prices/price_1/archive" && defaultPriceId === "price_1") {
      return json({ error: "default_price_in_use" }, 409);
    }
    return json(archived);
  });
}

export const change = (client: ReturnType<typeof harnessReturning>["client"]) =>
  client.catalogue.priceDraft("prod_1").unitAmount(1_200).currency("EUR").replacing("price_1");
