import type { Price, Product } from "../../src/catalogue/types";
import { Header } from "../../src/constants";
import { type Call, harnessOf, json } from "./harness";
import { routeOf } from "./price-replacement";

export const keyOf = (call: Call) => call.headers[Header.IDEMPOTENCY_KEY];

export const writesOf = (calls: Call[]) => calls.filter((call) => call.method !== "GET");

export function productOf(overrides: Partial<Product> & { id: string }): Product {
  return {
    name: "Gold",
    description: null,
    lookupKey: "sku-1",
    active: true,
    createdAt: "v0",
    updatedAt: "v0",
    defaultPriceId: null,
    ...overrides,
  };
}

interface Answer {
  status: number;
  body: unknown;
}

interface FakeOptions {
  products?: Product[];
  lostResponse?: (call: Call) => boolean;
  refused?: (call: Call) => boolean;
  unlisted?: string[];
  answered?: (call: Call) => void;
}

export function fakeMirrorCatalogue(options: FakeOptions = {}) {
  const products = new Map((options.products ?? []).map((product) => [product.id, product]));
  const prices: Price[] = [];
  const replays = new Map<string, { request: string; answer: Answer }>();
  let version = 0;
  const stamp = () => {
    version += 1;
    return `v${version}`;
  };
  const store = (product: Product) => {
    products.set(product.id, product);
    return { status: 200, body: product };
  };
  const conditional = (product: Product, call: Call, apply: () => Product): Answer => {
    const expected = (call.body as { expectedUpdatedAt?: string } | undefined)?.expectedUpdatedAt;
    if (expected !== undefined && expected !== product.updatedAt) {
      return { status: 409, body: { error: "stale_resource", resource: product } };
    }
    return store(apply());
  };

  const answer = (call: Call): Answer => {
    const url = new URL(call.url);
    const segments = url.pathname.split("/").slice(2);
    const product = products.get(segments[1] ?? "");
    if (call.method === "GET" && segments[0] === "prices") {
      const productId = url.searchParams.get("productId");
      return { status: 200, body: { data: prices.filter((p) => p.productId === productId) } };
    }
    if (call.method === "GET" && segments.length === 1) {
      const lookupKey = url.searchParams.get("lookupKey");
      const active = url.searchParams.get("active") !== "false";
      const data = [...products.values()].filter(
        (p) =>
          p.lookupKey === lookupKey && p.active === active && !options.unlisted?.includes(p.id),
      );
      return { status: 200, body: { data, nextCursor: null } };
    }
    if (call.method === "POST" && segments.length === 1) {
      const body = call.body as { name: string; lookupKey: string };
      const holder = [...products.values()].find((p) => p.lookupKey === body.lookupKey);
      if (holder !== undefined) {
        return { status: 409, body: { error: "lookup_key_conflict", resource: holder } };
      }
      const id = `prod_${products.size + 1}`;
      return store(productOf({ id, ...body, createdAt: stamp(), updatedAt: `v${version}` }));
    }
    if (product === undefined) {
      return { status: 404, body: { error: "resource_not_found" } };
    }
    if (call.method === "GET") {
      return { status: 200, body: product };
    }
    if (segments[2] === "prices") {
      const body = call.body as { unitAmount: number; currency: string };
      const price = { id: `price_${prices.length + 1}`, productId: product.id, ...body } as Price;
      prices.push(price);
      store({ ...product, defaultPriceId: product.defaultPriceId ?? price.id });
      return { status: 200, body: price };
    }
    if (call.method === "PATCH") {
      const { name } = call.body as { name: string };
      return conditional(product, call, () => ({ ...product, name, updatedAt: stamp() }));
    }
    const active = segments[2] === "reactivate";
    return conditional(product, call, () => ({ ...product, active, updatedAt: stamp() }));
  };

  const harness = harnessOf((call) => {
    if (options.refused?.(call) === true) {
      return json({ error: "operation_failed" }, 503);
    }
    const key = keyOf(call);
    const request = JSON.stringify([routeOf(call), call.body]);
    const replay = key === undefined ? undefined : replays.get(key);
    if (replay !== undefined && replay.request !== request) {
      return json({ error: "idempotency_conflict" }, 409);
    }
    const result = replay?.answer ?? answer(call);
    if (key !== undefined && result.status === 200) {
      replays.set(key, { request, answer: result });
    }
    options.answered?.(call);
    if (options.lostResponse?.(call) === true) {
      return json({ error: "operation_failed" }, 503);
    }
    return json(result.body, result.status);
  });
  return { ...harness, products, prices };
}
