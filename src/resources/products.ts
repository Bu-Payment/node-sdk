import { type Page, paginate } from "../core/pagination";
import type {
  ListProductCrossSellsQuery,
  ListProductsQuery,
  Product,
  ProductCrossSell,
  ProductEntitlementResolution,
} from "../models/catalogue";
import { Resource } from "./resource";

export class ProductsResource extends Resource {
  list(query: ListProductsQuery = {}): Promise<Page<Product>> {
    return this.send({ method: "GET", path: "/v1/products", query });
  }

  listAll(query: ListProductsQuery = {}): AsyncGenerator<Product, void, undefined> {
    return paginate((page: ListProductsQuery) => this.list(page), query);
  }

  get(productId: string): Promise<Product> {
    return this.send({ method: "GET", path: `/v1/products/${this.segment(productId)}` });
  }

  listCrossSells(
    productId: string,
    query: ListProductCrossSellsQuery = {},
  ): Promise<Page<ProductCrossSell>> {
    return this.send({
      method: "GET",
      path: `/v1/products/${this.segment(productId)}/cross-sells`,
      query,
    });
  }

  listAllCrossSells(
    productId: string,
    query: ListProductCrossSellsQuery = {},
  ): AsyncGenerator<ProductCrossSell, void, undefined> {
    return paginate(
      (page: ListProductCrossSellsQuery) => this.listCrossSells(productId, page),
      query,
    );
  }

  getEntitlements(productId: string): Promise<ProductEntitlementResolution> {
    return this.send({
      method: "GET",
      path: `/v1/products/${this.segment(productId)}/entitlements`,
    });
  }
}
