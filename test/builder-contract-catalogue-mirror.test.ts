import { describe, expect, it, vi } from "vitest";
import { ErrorCode } from "../src/constants";
import { harnessReturning, harnessStalling, json } from "./support/harness";
import { routeOf } from "./support/price-replacement";
import { productOf } from "./support/product-mirror";

type Client = ReturnType<typeof harnessReturning>["client"];

const complete = (client: Client, lookupKey = "sku-1") =>
  client.catalogue
    .productMirror(lookupKey)
    .knownId("prod_1")
    .name("Gold")
    .active(true)
    .defaultUnitAmount(100)
    .defaultCurrency("EUR")
    .idempotencyKey("mirror-sku-1");

describe("product mirror builder contract", () => {
  it("freezes the entry and every configured step", () => {
    const { client } = harnessReturning();
    const entry = client.catalogue.productMirror("sku-1");
    const steps = [
      entry,
      entry.knownId("prod_1"),
      entry.name("Gold"),
      entry.active(false),
      entry.defaultUnitAmount(100),
      entry.defaultUnitAmount(100).defaultCurrency("EUR"),
      entry.idempotencyKey("k"),
      entry.signal(new AbortController().signal),
      entry.timeoutMs(5),
      complete(client),
    ];
    for (const step of steps) {
      expect(Object.isFrozen(step)).toBe(true);
    }
  });

  it("issues no request from the entry or any configuration method", () => {
    const { client, calls } = harnessReturning();
    expect(() => client.catalogue.productMirror("")).not.toThrow();
    complete(client, "").knownId("").timeoutMs(5);
    complete(client).signal(new AbortController().signal);
    expect(calls).toHaveLength(0);
  });

  it("leaves the builder it branched from untouched", async () => {
    const { client, calls } = harnessReturning(productOf({ id: "prod_1", defaultPriceId: "p_1" }));
    const base = complete(client);
    const archived = base.active(false);
    expect(archived).not.toBe(base);
    expect(await base.ensure()).toMatchObject({ outcome: "found", changes: [] });
    expect(calls).toHaveLength(1);
  });

  it("offers ensure only once named and keyed, with any default price complete", () => {
    const { client } = harnessReturning();
    const entry = client.catalogue.productMirror("sku-1");
    const named = entry.name("Gold");
    expect("ensure" in named.idempotencyKey("k")).toBe(true);
    expect("ensure" in complete(client)).toBe(true);
    expect("ensure" in entry).toBe(false);
    expect("ensure" in named).toBe(false);
    expect("ensure" in entry.idempotencyKey("k")).toBe(false);
    expect("ensure" in named.idempotencyKey("k").defaultUnitAmount(100)).toBe(false);
  });

  it("offers the default currency only after the default amount", () => {
    const { client } = harnessReturning();
    const entry = client.catalogue.productMirror("sku-1");
    expect("defaultCurrency" in entry).toBe(false);
    expect("defaultCurrency" in entry.defaultUnitAmount(100)).toBe(true);
  });

  it.each([
    ["an empty lookup key", "", "k"],
    ["a blank lookup key", "  ", "k"],
    ["an invalid idempotency key", "sku-1", " k"],
  ])("rejects %s at the terminal before any request", async (_case, lookupKey, key) => {
    const { client, calls } = harnessReturning();
    const mirroring = client.catalogue.productMirror(lookupKey).name("Gold").idempotencyKey(key);
    await expect(mirroring.ensure()).rejects.toMatchObject({ code: ErrorCode.REQUEST_INVALID });
    expect(calls).toHaveLength(0);
  });

  it("rejects an empty known id at the terminal before any request", async () => {
    const { client, calls } = harnessReturning();
    await expect(complete(client).knownId("").ensure()).rejects.toMatchObject({
      code: ErrorCode.REQUEST_INVALID,
    });
    expect(calls).toHaveLength(0);
  });

  const stallingOnTheRename = () =>
    harnessStalling((call) =>
      routeOf(call) === "GET /v1/products/prod_1"
        ? json(productOf({ id: "prod_1", name: "Silver", defaultPriceId: "p_1" }))
        : undefined,
    );

  it("carries the abort signal to the writes it sends", async () => {
    const { client, calls } = stallingOnTheRename();
    const controller = new AbortController();
    const ensuring = complete(client).signal(controller.signal).ensure();
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    controller.abort();
    await expect(ensuring).rejects.toMatchObject({ code: ErrorCode.REQUEST_CANCELLED });
    expect(calls.map(routeOf)).toEqual(["GET /v1/products/prod_1", "PATCH /v1/products/prod_1"]);
  });

  it("carries the timeout to the writes it sends", async () => {
    const { client, calls } = stallingOnTheRename();
    await expect(complete(client).timeoutMs(5).ensure()).rejects.toMatchObject({
      code: ErrorCode.NETWORK_UNAVAILABLE,
      metadata: { timeoutMs: 5 },
    });
    expect(calls.map(routeOf)).toEqual(["GET /v1/products/prod_1", "PATCH /v1/products/prod_1"]);
  });
});
