import { type Page, paginate } from "../core/pagination";
import type { QueryInput } from "../core/request-target";
import type { ResolveShippingRatesQuery, ShippingRate } from "../models/checkout";
import { Resource } from "./resource";

export class ShippingRatesResource extends Resource {
  list(query: ResolveShippingRatesQuery): Promise<Page<ShippingRate>> {
    return this.send({ method: "GET", path: "/v1/shipping-rates", query: wireQuery(query) });
  }

  listAll(query: ResolveShippingRatesQuery): AsyncGenerator<ShippingRate, void, undefined> {
    return paginate((page: ResolveShippingRatesQuery) => this.list(page), query);
  }
}

function wireQuery(query: ResolveShippingRatesQuery): QueryInput {
  return {
    currency: query.currency,
    destinationCountry: query.destinationCountry,
    productIds: query.productIds.join(","),
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    ...(query.limit === undefined ? {} : { limit: query.limit }),
  };
}
