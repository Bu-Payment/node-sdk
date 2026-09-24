import { type Page, paginate } from "../core/pagination";
import type { ListPricesQuery, Price } from "../models/catalogue";
import { Resource } from "./resource";

export class PricesResource extends Resource {
  list(query: ListPricesQuery = {}): Promise<Page<Price>> {
    return this.send({ method: "GET", path: "/v1/prices", query });
  }

  listAll(query: ListPricesQuery = {}): AsyncGenerator<Price, void, undefined> {
    return paginate((page: ListPricesQuery) => this.list(page), query);
  }

  get(priceId: string): Promise<Price> {
    return this.send({ method: "GET", path: `/v1/prices/${this.segment(priceId)}` });
  }
}
