import { ErrorCode } from "../constants";
import { type Page, paginate } from "../core/pagination";
import type { QueryInput } from "../core/request-target";
import { BuPaymentError } from "../errors";
import type { ResolveShippingRatesQuery, ShippingRate } from "../models/checkout";
import { Resource } from "./resource";

export class ShippingRatesResource extends Resource {
  async list(query: ResolveShippingRatesQuery): Promise<Page<ShippingRate>> {
    return await this.send({
      method: "GET",
      path: "/v1/shipping-rates",
      query: wireQuery(query),
    });
  }

  listAll(query: ResolveShippingRatesQuery): AsyncGenerator<ShippingRate, void, undefined> {
    return paginate((page: ResolveShippingRatesQuery) => this.list(page), query);
  }
}

function wireQuery(query: ResolveShippingRatesQuery): QueryInput {
  if (query.productIds.length === 0) {
    throw shippingQueryInvalid("Shipping rates resolve against at least one product");
  }
  if (query.productIds.some((productId) => productId.includes(","))) {
    throw shippingQueryInvalid("A product identifier must not contain a comma");
  }
  return {
    currency: query.currency,
    destinationCountry: query.destinationCountry,
    productIds: query.productIds.join(","),
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    ...(query.limit === undefined ? {} : { limit: query.limit }),
  };
}

function shippingQueryInvalid(message: string): BuPaymentError {
  return new BuPaymentError(message, { code: ErrorCode.REQUEST_INVALID });
}
