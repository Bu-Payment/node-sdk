import {
  type CursorScope,
  type PageMethods,
  pageMethods,
  pageQuery,
  type RequestScope,
  readRequest,
  type ScopeMethods,
  type Sender,
  scopeMethods,
} from "../core/builder";
import type { Page } from "../core/pagination";
import { encodePathSegment } from "../core/request-target";
import type { Price, Product, ProductCrossSell, ProductEntitlementResolution } from "./types";

interface ProductListState extends CursorScope {
  active?: boolean;
}

interface PriceListState extends CursorScope {
  productId?: string;
  lookupKey?: string;
  active?: boolean;
}

export interface ProductListBuilder extends PageMethods<ProductListBuilder, Product> {
  active(active: boolean): ProductListBuilder;
}

export interface ProductBuilder extends ScopeMethods<ProductBuilder> {
  get(): Promise<Product>;
}

export interface PriceListBuilder extends PageMethods<PriceListBuilder, Price> {
  productId(productId: string): PriceListBuilder;
  lookupKey(lookupKey: string): PriceListBuilder;
  active(active: boolean): PriceListBuilder;
}

export interface PriceBuilder extends ScopeMethods<PriceBuilder> {
  get(): Promise<Price>;
}

export interface CrossSellListBuilder extends PageMethods<CrossSellListBuilder, ProductCrossSell> {}

export interface EntitlementsBuilder extends ScopeMethods<EntitlementsBuilder> {
  get(): Promise<ProductEntitlementResolution>;
}

export interface CatalogueClient {
  products(): ProductListBuilder;
  product(productId: string): ProductBuilder;
  prices(): PriceListBuilder;
  price(priceId: string): PriceBuilder;
  crossSells(productId: string): CrossSellListBuilder;
  entitlements(productId: string): EntitlementsBuilder;
}

export function createCatalogueClient(send: Sender): CatalogueClient {
  return Object.freeze({
    products: () => productList(send, {}),
    product: (productId: string) => singleProduct(send, productId, {}),
    prices: () => priceList(send, {}),
    price: (priceId: string) => singlePrice(send, priceId, {}),
    crossSells: (productId: string) => crossSellList(send, productId, {}),
    entitlements: (productId: string) => entitlements(send, productId, {}),
  });
}

function productList(send: Sender, state: ProductListState): ProductListBuilder {
  const next = (update: Partial<ProductListState>) => productList(send, { ...state, ...update });
  const read = (page: ProductListState) =>
    send<Page<Product>>(
      readRequest(
        "/v1/products",
        page,
        pageQuery(page, page.active === undefined ? {} : { active: page.active }),
      ),
    );
  return Object.freeze({
    ...pageMethods(state, next, read),
    active: (active: boolean) => next({ active }),
  });
}

function singleProduct(send: Sender, productId: string, state: RequestScope): ProductBuilder {
  const next = (update: Partial<RequestScope>) =>
    singleProduct(send, productId, { ...state, ...update });
  return Object.freeze({
    ...scopeMethods(next),
    get: () => send<Product>(readRequest(`/v1/products/${encodePathSegment(productId)}`, state)),
  });
}

function priceList(send: Sender, state: PriceListState): PriceListBuilder {
  const next = (update: Partial<PriceListState>) => priceList(send, { ...state, ...update });
  const read = (page: PriceListState) =>
    send<Page<Price>>(
      readRequest(
        "/v1/prices",
        page,
        pageQuery(page, {
          ...(page.productId === undefined ? {} : { productId: page.productId }),
          ...(page.lookupKey === undefined ? {} : { lookupKey: page.lookupKey }),
          ...(page.active === undefined ? {} : { active: page.active }),
        }),
      ),
    );
  return Object.freeze({
    ...pageMethods(state, next, read),
    productId: (productId: string) => next({ productId }),
    lookupKey: (lookupKey: string) => next({ lookupKey }),
    active: (active: boolean) => next({ active }),
  });
}

function singlePrice(send: Sender, priceId: string, state: RequestScope): PriceBuilder {
  const next = (update: Partial<RequestScope>) =>
    singlePrice(send, priceId, { ...state, ...update });
  return Object.freeze({
    ...scopeMethods(next),
    get: () => send<Price>(readRequest(`/v1/prices/${encodePathSegment(priceId)}`, state)),
  });
}

function crossSellList(send: Sender, productId: string, state: CursorScope): CrossSellListBuilder {
  const next = (update: Partial<CursorScope>) =>
    crossSellList(send, productId, { ...state, ...update });
  const read = (page: CursorScope) =>
    send<Page<ProductCrossSell>>(
      readRequest(
        `/v1/products/${encodePathSegment(productId)}/cross-sells`,
        page,
        pageQuery(page),
      ),
    );
  return Object.freeze(pageMethods(state, next, read));
}

function entitlements(send: Sender, productId: string, state: RequestScope): EntitlementsBuilder {
  const next = (update: Partial<RequestScope>) =>
    entitlements(send, productId, { ...state, ...update });
  return Object.freeze({
    ...scopeMethods(next),
    get: () =>
      send<ProductEntitlementResolution>(
        readRequest(`/v1/products/${encodePathSegment(productId)}/entitlements`, state),
      ),
  });
}
