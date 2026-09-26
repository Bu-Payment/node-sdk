import {
  type CursorScope,
  type DeferredSender,
  deferSender,
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
import { type PriceDraft, priceDraft } from "./price-writes";
import {
  type ProductDraft,
  type ProductUpdate,
  productDraft,
  productUpdate,
} from "./product-writes";
import { type StateChangeBuilder, stateChange } from "./state-change";
import type { Price, Product, ProductCrossSell, ProductEntitlementResolution } from "./types";

interface ProductListState extends CursorScope {
  active?: boolean;
  lookupKey?: string;
}

interface PriceListState extends CursorScope {
  productId?: string;
  lookupKey?: string;
  active?: boolean;
}

export interface ProductListBuilder extends PageMethods<ProductListBuilder, Product> {
  active(active: boolean): ProductListBuilder;
  lookupKey(lookupKey: string): ProductListBuilder;
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
  createProduct(): ProductDraft<Record<never, never>>;
  updateProduct(productId: string): ProductUpdate<Record<never, never>>;
  archiveProduct(productId: string): StateChangeBuilder<Product, "archive">;
  reactivateProduct(productId: string): StateChangeBuilder<Product, "reactivate">;
  createPrice(productId: string): PriceDraft<Record<never, never>>;
  archivePrice(priceId: string): StateChangeBuilder<Price, "archive">;
  reactivatePrice(priceId: string): StateChangeBuilder<Price, "reactivate">;
}

export function createCatalogueClient(dispatch: Sender): CatalogueClient {
  const send = deferSender(dispatch);
  const productPath = (productId: string) => () => `/v1/products/${encodePathSegment(productId)}`;
  const pricePath = (priceId: string) => () => `/v1/prices/${encodePathSegment(priceId)}`;
  return Object.freeze({
    products: () => productList(send, {}),
    product: (productId: string) => singleProduct(send, productId, {}),
    prices: () => priceList(send, {}),
    price: (priceId: string) => singlePrice(send, priceId, {}),
    crossSells: (productId: string) => crossSellList(send, productId, {}),
    entitlements: (productId: string) => entitlements(send, productId, {}),
    createProduct: () => productDraft(send, {}),
    updateProduct: (productId: string) => productUpdate(send, productPath(productId), {}),
    archiveProduct: (productId: string) =>
      stateChange<Product, "archive">(send, productPath(productId), "archive", {}),
    reactivateProduct: (productId: string) =>
      stateChange<Product, "reactivate">(send, productPath(productId), "reactivate", {}),
    createPrice: (productId: string) => priceDraft(send, productId, {}),
    archivePrice: (priceId: string) =>
      stateChange<Price, "archive">(send, pricePath(priceId), "archive", {}),
    reactivatePrice: (priceId: string) =>
      stateChange<Price, "reactivate">(send, pricePath(priceId), "reactivate", {}),
  });
}

function productList(send: DeferredSender, state: ProductListState): ProductListBuilder {
  const next = (update: Partial<ProductListState>) => productList(send, { ...state, ...update });
  const read = (page: ProductListState) =>
    send<Page<Product>>(() =>
      readRequest(
        "/v1/products",
        page,
        pageQuery(page, {
          ...(page.active === undefined ? {} : { active: page.active }),
          ...(page.lookupKey === undefined ? {} : { lookupKey: page.lookupKey }),
        }),
      ),
    );
  return Object.freeze({
    ...pageMethods(state, next, read),
    active: (active: boolean) => next({ active }),
    lookupKey: (lookupKey: string) => next({ lookupKey }),
  });
}

function singleProduct(
  send: DeferredSender,
  productId: string,
  state: RequestScope,
): ProductBuilder {
  const next = (update: Partial<RequestScope>) =>
    singleProduct(send, productId, { ...state, ...update });
  return Object.freeze({
    ...scopeMethods(next),
    get: () =>
      send<Product>(() => readRequest(`/v1/products/${encodePathSegment(productId)}`, state)),
  });
}

function priceList(send: DeferredSender, state: PriceListState): PriceListBuilder {
  const next = (update: Partial<PriceListState>) => priceList(send, { ...state, ...update });
  const read = (page: PriceListState) =>
    send<Page<Price>>(() =>
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

function singlePrice(send: DeferredSender, priceId: string, state: RequestScope): PriceBuilder {
  const next = (update: Partial<RequestScope>) =>
    singlePrice(send, priceId, { ...state, ...update });
  return Object.freeze({
    ...scopeMethods(next),
    get: () => send<Price>(() => readRequest(`/v1/prices/${encodePathSegment(priceId)}`, state)),
  });
}

function crossSellList(
  send: DeferredSender,
  productId: string,
  state: CursorScope,
): CrossSellListBuilder {
  const next = (update: Partial<CursorScope>) =>
    crossSellList(send, productId, { ...state, ...update });
  const read = (page: CursorScope) =>
    send<Page<ProductCrossSell>>(() =>
      readRequest(
        `/v1/products/${encodePathSegment(productId)}/cross-sells`,
        page,
        pageQuery(page),
      ),
    );
  return Object.freeze(pageMethods(state, next, read));
}

function entitlements(
  send: DeferredSender,
  productId: string,
  state: RequestScope,
): EntitlementsBuilder {
  const next = (update: Partial<RequestScope>) =>
    entitlements(send, productId, { ...state, ...update });
  return Object.freeze({
    ...scopeMethods(next),
    get: () =>
      send<ProductEntitlementResolution>(() =>
        readRequest(`/v1/products/${encodePathSegment(productId)}/entitlements`, state),
      ),
  });
}
