import { ErrorCode } from "../constants";
import type { RequestScope, ScopeMethods } from "../core/builder";
import {
  idempotencyDigest,
  MAX_IDEMPOTENCY_KEY_LENGTH,
  parseIdempotencyKey,
} from "../core/idempotency";
import { BuPaymentError } from "../errors";
import type { CatalogueClient } from "./client";
import type {
  Product,
  ProductMirrorChange,
  ProductMirrorOutcome,
  ProductMirrorResult,
} from "./types";

export interface MirrorState extends RequestScope {
  knownId?: string;
  name?: string;
  active?: boolean;
  defaultUnitAmount?: number;
  defaultCurrency?: string;
  idempotencyKey?: string;
}

type ReadyState = MirrorState & { name: string; idempotencyKey: string };

export type MirrorCatalogue = Pick<
  CatalogueClient,
  | "product"
  | "products"
  | "prices"
  | "productDraft"
  | "updateProduct"
  | "archiveProduct"
  | "reactivateProduct"
  | "priceDraft"
>;

interface MirrorRun {
  catalogue: MirrorCatalogue;
  lookupKey: string;
  state: ReadyState;
  keyFor: (step: string, ...dependsOn: string[]) => string;
}

interface DefaultPrice {
  unitAmount: number;
  currency: string;
}

interface Creation {
  product: Product;
  held: boolean;
}

interface Located {
  product: Product;
  outcome: ProductMirrorOutcome;
}

export async function ensureMirror(
  catalogue: MirrorCatalogue,
  lookupKey: string,
  state: ReadyState,
): Promise<ProductMirrorResult> {
  if (lookupKey.trim() === "") {
    throw new BuPaymentError("Lookup key must not be empty", { code: ErrorCode.REQUEST_INVALID });
  }
  const run: MirrorRun = {
    catalogue,
    lookupKey,
    state,
    keyFor: derivedKeys(parseIdempotencyKey(state.idempotencyKey)),
  };
  const { product: located, outcome } = await locateOrCreate(run);
  let product = located;
  const changes: ProductMirrorChange[] = [];
  if (state.active === true && !product.active) {
    product = await changeState(run, product, "reactivate");
    changes.push("reactivated");
  }
  const defaultPrice = defaultPriceOf(state);
  if (defaultPrice !== undefined && (await lacksPrice(run, product))) {
    product = await createDefaultPrice(run, product, defaultPrice);
    changes.push("priced");
  }
  if (product.name !== state.name) {
    product = await rename(run, product);
    changes.push("renamed");
  }
  if (state.active === false && product.active) {
    product = await changeState(run, product, "archive");
    changes.push("archived");
  }
  return { product, outcome, changes };
}

function derivedKeys(base: string): MirrorRun["keyFor"] {
  return (step, ...dependsOn) => {
    const suffix = `${step}:${idempotencyDigest(JSON.stringify(dependsOn))}`;
    const key = `${base}:${suffix}`;
    return [...key].length <= MAX_IDEMPOTENCY_KEY_LENGTH
      ? key
      : `${idempotencyDigest(base)}:${suffix}`;
  };
}

function scoped<TBuilder extends ScopeMethods<TBuilder>>(
  builder: TBuilder,
  scope: RequestScope,
): TBuilder {
  const signalled = scope.signal === undefined ? builder : builder.signal(scope.signal);
  return scope.timeoutMs === undefined ? signalled : signalled.timeoutMs(scope.timeoutMs);
}

async function locateOrCreate(run: MirrorRun): Promise<Located> {
  const { knownId } = run.state;
  if (knownId !== undefined) {
    const known = await scoped(run.catalogue.product(knownId), run.state).find();
    if (known?.lookupKey === run.lookupKey) {
      return { product: known, outcome: "found" };
    }
  }
  const lookedUp = (await findByLookupKey(run, true)) ?? (await findByLookupKey(run, false));
  if (lookedUp !== undefined) {
    return { product: lookedUp, outcome: knownId === undefined ? "found" : "recovered" };
  }
  return await create(run, knownId === undefined ? "found" : "recovered");
}

async function findByLookupKey(run: MirrorRun, active: boolean): Promise<Product | undefined> {
  const list = run.catalogue.products().lookupKey(run.lookupKey).active(active);
  return (await scoped(list, run.state).get()).data[0];
}

async function create(run: MirrorRun, outcomeWhenHeld: ProductMirrorOutcome): Promise<Located> {
  const key = run.keyFor("create-product", run.lookupKey, run.state.name);
  const creation = await createUnder(run, key);
  return { product: creation.product, outcome: creation.held ? outcomeWhenHeld : "created" };
}

async function createUnder(run: MirrorRun, idempotencyKey: string): Promise<Creation> {
  const draft = run.catalogue
    .productDraft()
    .name(run.state.name)
    .lookupKey(run.lookupKey)
    .idempotencyKey(idempotencyKey);
  try {
    return { product: await scoped(draft, run.state).create(), held: false };
  } catch (error) {
    const holder = lookupKeyHolder(run, error);
    if (holder === undefined) {
      throw error;
    }
    return { product: holder, held: true };
  }
}

function lookupKeyHolder(run: MirrorRun, error: unknown): Product | undefined {
  if (!(error instanceof BuPaymentError) || error.code !== ErrorCode.LOOKUP_KEY_CONFLICT) {
    return undefined;
  }
  const holder = (error as BuPaymentError<Product>).resource;
  return holder?.lookupKey === run.lookupKey ? holder : undefined;
}

function defaultPriceOf(state: MirrorState): DefaultPrice | undefined {
  const { defaultUnitAmount, defaultCurrency } = state;
  return defaultUnitAmount === undefined || defaultCurrency === undefined
    ? undefined
    : { unitAmount: defaultUnitAmount, currency: defaultCurrency };
}

async function lacksPrice(run: MirrorRun, product: Product): Promise<boolean> {
  if (!product.active || product.defaultPriceId !== null) {
    return false;
  }
  return !(await holdsPrice(run, product, true)) && !(await holdsPrice(run, product, false));
}

async function holdsPrice(run: MirrorRun, product: Product, active: boolean): Promise<boolean> {
  const prices = run.catalogue.prices().productId(product.id).active(active).limit(1);
  return (await scoped(prices, run.state).get()).data.length > 0;
}

async function createDefaultPrice(
  run: MirrorRun,
  product: Product,
  price: DefaultPrice,
): Promise<Product> {
  const draft = run.catalogue
    .priceDraft(product.id)
    .unitAmount(price.unitAmount)
    .currency(price.currency)
    .idempotencyKey(run.keyFor("create-price", product.id));
  await scoped(draft, run.state).create();
  return await scoped(run.catalogue.product(product.id), run.state).get();
}

async function rename(run: MirrorRun, product: Product): Promise<Product> {
  const update = run.catalogue
    .updateProduct(product.id)
    .name(run.state.name)
    .expectedUpdatedAt(product.updatedAt)
    .idempotencyKey(run.keyFor("rename", product.id, product.updatedAt, run.state.name));
  return await scoped(update, run.state).update();
}

async function changeState(
  run: MirrorRun,
  product: Product,
  terminal: "archive" | "reactivate",
): Promise<Product> {
  const key = run.keyFor(terminal, product.id, product.updatedAt);
  if (terminal === "archive") {
    const change = run.catalogue.archiveProduct(product.id);
    return await scoped(change, run.state)
      .expectedUpdatedAt(product.updatedAt)
      .idempotencyKey(key)
      .archive();
  }
  const change = run.catalogue.reactivateProduct(product.id);
  return await scoped(change, run.state)
    .expectedUpdatedAt(product.updatedAt)
    .idempotencyKey(key)
    .reactivate();
}
