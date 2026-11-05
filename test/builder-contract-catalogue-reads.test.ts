import { describe, expect, it } from "vitest";
import { ErrorCode } from "../src/constants";
import { callAt, harnessOf, harnessReturning, json, pathOf, queryOf } from "./support/harness";

type Client = ReturnType<typeof harnessReturning>["client"];
type Collecting = { collect(): Promise<unknown[]> };

const twoPages = [
  { data: [{ id: "a" }], nextCursor: "cur_2", hasMore: true },
  { data: [{ id: "b" }], nextCursor: null, hasMore: false },
];

const paginatedLists: Record<string, (client: Client) => Collecting> = {
  products: (client) => client.catalogue.products(),
  prices: (client) => client.catalogue.prices(),
  crossSells: (client) => client.catalogue.crossSells("prod_1"),
  customers: (client) => client.customers.list(),
  payments: (client) => client.payments.list(),
  invoices: (client) => client.invoices.list(),
  subscriptions: (client) => client.subscriptions.list(),
  refunds: (client) => client.refunds.list(),
  events: (client) => client.events.list(),
  priceMigrations: (client) => client.priceMigrations.list(),
  shippingRates: (client) =>
    client.checkout.shippingRates().currency("EUR").destinationCountry("PT").product("prod_1"),
};

const records = {
  product: (client: Client) => client.catalogue.product("rec_1"),
  price: (client: Client) => client.catalogue.price("rec_1"),
};

describe("collect on every paginated list", () => {
  it.each(Object.keys(paginatedLists))("%s walks every page only once called", async (name) => {
    const { client, calls } = harnessReturning(...twoPages);
    const list = (paginatedLists[name] as (client: Client) => Collecting)(client);
    expect(calls).toHaveLength(0);
    expect(await list.collect()).toEqual([{ id: "a" }, { id: "b" }]);
    expect(calls).toHaveLength(2);
  });

  it("walks again from the start each time the same builder is collected", async () => {
    const { client } = harnessReturning(...twoPages, ...twoPages);
    const list = client.customers.list();
    const first = await list.collect();
    expect(first).toHaveLength(2);
    expect(await list.collect()).toEqual(first);
  });

  it("leaves the builder it branched from untouched", async () => {
    const { client, calls } = harnessReturning(
      { data: [], nextCursor: null },
      { data: [], nextCursor: null },
    );
    const base = client.customers.list();
    await base.limit(5).collect();
    await base.collect();
    expect(queryOf(callAt(calls, 0))).toBe("?limit=5");
    expect(queryOf(callAt(calls, 1))).toBe("");
  });

  it("starts from the cursor and keeps the limit the builder was given", async () => {
    const { client, calls } = harnessReturning(...twoPages);
    await client.customers.list().cursor("cur_1").limit(10).collect();
    expect(queryOf(callAt(calls, 0))).toContain("cursor=cur_1");
    expect(queryOf(callAt(calls, 0))).toContain("limit=10");
    expect(queryOf(callAt(calls, 1))).toContain("cursor=cur_2");
  });

  it("rejects with no partial array when a later page fails", async () => {
    let served = 0;
    const { client } = harnessOf(() => {
      served += 1;
      return served === 1
        ? json({ data: [{ id: "a" }], nextCursor: "cur_2" })
        : json({ error: "operation_failed" }, 503);
    });
    await expect(client.customers.list().collect()).rejects.toMatchObject({
      code: ErrorCode.OPERATION_FAILED,
      status: 503,
    });
  });

  it("does not exist on shipping rates until the quote is complete", () => {
    const { client } = harnessReturning();
    const rates = client.checkout.shippingRates();
    expect("collect" in rates.currency("EUR").destinationCountry("PT")).toBe(false);
    expect("collect" in rates.destinationCountry("PT").product("prod_1")).toBe(false);
    expect("collect" in rates.currency("EUR").product("prod_1")).toBe(false);
  });
});

describe.each(Object.keys(records))("find on a catalogue %s", (name) => {
  const record = records[name as keyof typeof records];
  const pathPart = name === "product" ? "/products/rec_1" : "/prices/rec_1";

  it("reads its own path only once called", async () => {
    const { client, calls } = harnessReturning({ id: "rec_1" });
    const builder = record(client);
    expect(calls).toHaveLength(0);
    await builder.find();
    expect(calls).toHaveLength(1);
    expect(pathOf(callAt(calls, 0))).toContain(pathPart);
  });

  it.each([
    ["an unavailable API", json({ error: "operation_failed" }, 503)],
    ["refused credentials", json({ error: "application_auth_invalid" }, 401)],
    ["a denied capability", json({ error: "application_capability_denied" }, 403)],
    ["a 404 page from a proxy", new Response("<html>nginx</html>", { status: 404 })],
    ["an empty 404", new Response("", { status: 404 })],
    ["a JSON 404 with no API error", json({ message: "no route" }, 404)],
  ])("throws on %s instead of resolving to null", async (_case, response) => {
    const { client } = harnessOf(() => response.clone());
    await expect(record(client).find()).rejects.toBeInstanceOf(Error);
  });

  it("marks a not-found the API did not state as read from the status", async () => {
    const { client } = harnessOf(() => new Response("<html>nginx</html>", { status: 404 }));
    await expect(record(client).get()).rejects.toMatchObject({
      code: ErrorCode.RESOURCE_NOT_FOUND,
      metadata: { codeFromStatus: true },
    });
  });

  it("resolves to null when the API itself answers not found", async () => {
    const { client } = harnessOf(() => json({ error: "resource_not_found" }, 404));
    expect(await record(client).find()).toBeNull();
  });
});
