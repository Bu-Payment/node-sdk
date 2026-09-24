import { describe, expect, it } from "vitest";
import type { BuPaymentClient } from "../src/client";
import { callAt, harnessReturning, queryOf } from "./support/harness";

type Client = BuPaymentClient;

describe("configuration methods", () => {
  it("carries every invoice filter onto the query", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null, hasMore: false });
    await client.invoices
      .list()
      .customerId("cus_1")
      .subscriptionId("sub_1")
      .status("paid")
      .number("INV-1")
      .cursor("cur_1")
      .limit(10)
      .get();
    expect(queryOf(callAt(calls, 0))).toBe(
      "?customerId=cus_1&subscriptionId=sub_1&status=paid&number=INV-1&cursor=cur_1&limit=10",
    );
  });

  it("carries every subscription filter onto the query", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null, hasMore: false });
    await client.subscriptions
      .list()
      .customerId("cus_1")
      .status("paused")
      .priceId("price_1")
      .productId("prod_1")
      .name("Gold")
      .includeBindings(true)
      .get();
    expect(queryOf(callAt(calls, 0))).toBe(
      "?customerId=cus_1&status=paused&priceId=price_1&productId=prod_1&name=Gold&includeBindings=true",
    );
  });

  it("carries the optional refund reason", async () => {
    const { client, calls } = harnessReturning({ id: "ref_1" });
    await client.refunds.create().paymentId("pay_1").reason("duplicate charge").create();
    expect(callAt(calls, 0).body).toEqual({ paymentId: "pay_1", reason: "duplicate charge" });
  });

  it("carries the optional payment reference and description", async () => {
    const { client, calls } = harnessReturning({ id: "pay_1" });
    await client.payments
      .create()
      .customerId("cus_1")
      .priceId("price_1")
      .reference("order_1")
      .description("Gold plan")
      .create();
    expect(callAt(calls, 0).body).toMatchObject({
      reference: "order_1",
      description: "Gold plan",
    });
  });

  it("carries the optional migration item and quantity", async () => {
    const { client, calls } = harnessReturning({ id: "mig_1" });
    await client.subscriptions
      .subscription("sub_1")
      .priceMigration()
      .targetPriceId("price_2")
      .itemId("item_1")
      .quantity(3)
      .scheduledAt("2026-03-01T00:00:00Z")
      .prorationPolicy("none")
      .paymentFailurePolicy("applyChange")
      .create();
    expect(callAt(calls, 0).body).toEqual({
      targetPriceId: "price_2",
      itemId: "item_1",
      quantity: 3,
      timing: { kind: "scheduled", effectiveAt: "2026-03-01T00:00:00Z" },
      prorationPolicy: "none",
      paymentFailurePolicy: "applyChange",
    });
  });

  it("carries an immediate pause and the resume date it schedules", async () => {
    const { client, calls } = harnessReturning({}, {});
    await client.subscriptions
      .subscription("sub_1")
      .pauseSubscription()
      .effectiveTiming("immediate")
      .resumeBillingPolicy("continueExistingBillingPeriod")
      .resumeAt("2026-04-01T00:00:00Z")
      .pause();
    await client.subscriptions
      .subscription("sub_1")
      .pausePaymentCollection()
      .behavior("keepAsDraft")
      .resumesAt(null)
      .pause();
    expect(callAt(calls, 0).body).toMatchObject({ resumeAt: "2026-04-01T00:00:00Z" });
    expect(callAt(calls, 1).body).toMatchObject({ resumesAt: null });
  });

  it("carries an immediate resume of a paused subscription", async () => {
    const { client, calls } = harnessReturning({});
    await client.subscriptions
      .subscription("sub_1")
      .resumePausedSubscription()
      .immediately()
      .billingPolicy("startNewBillingPeriod")
      .resume();
    expect(callAt(calls, 0).body).toEqual({
      target: "paused_subscription",
      effectiveTiming: "immediate",
      billingPolicy: "startNewBillingPeriod",
    });
  });

  it("carries the coupon evaluation moment and the session extras", async () => {
    const { client, calls } = harnessReturning({}, {});
    await client.checkout
      .coupon("WELCOME")
      .unitAmount(1_000)
      .currency("EUR")
      .at("2026-01-01T00:00:00Z")
      .evaluate();
    await client.checkout
      .subscriptionSession()
      .name("Gold")
      .priceId("price_1")
      .customerId("cus_1")
      .customerEmail("buyer@example.test")
      .customerName("Buyer")
      .trialDays(14)
      .successUrl("https://shop.test/ok")
      .cancelUrl("https://shop.test/no")
      .create();
    expect(callAt(calls, 0).body).toMatchObject({ at: "2026-01-01T00:00:00Z" });
    expect(callAt(calls, 1).body).toMatchObject({
      customer: { id: "cus_1", email: "buyer@example.test", name: "Buyer" },
      trialDays: 14,
    });
  });

  it("carries the tax place onto both the list and the calculation", async () => {
    const { client, calls } = harnessReturning({ data: [] }, {});
    await client.checkout.taxRates().productId("prod_1").country("PT").state("LIS").get();
    await client.checkout
      .taxRate("txr_1")
      .amount(1_000)
      .productId("prod_1")
      .country("PT")
      .state("LIS")
      .calculate();
    expect(queryOf(callAt(calls, 0))).toBe("?productId=prod_1&country=PT&state=LIS");
    expect(callAt(calls, 1).body).toEqual({
      amount: 1_000,
      productId: "prod_1",
      country: "PT",
      state: "LIS",
    });
  });

  it("carries the endpoint description and url on an update", async () => {
    const { client, calls } = harnessReturning({});
    await client.webhooks
      .endpoint("whe_1")
      .url("https://shop.test/hooks-v2")
      .description(null)
      .event("payment.succeeded")
      .update();
    expect(callAt(calls, 0).body).toEqual({
      url: "https://shop.test/hooks-v2",
      description: null,
      enabledEvents: ["payment.succeeded"],
    });
  });

  it("accepts a signal and a timeout on a read", async () => {
    const { client, calls } = harnessReturning({});
    const controller = new AbortController();
    await client.events.event("evt_1").signal(controller.signal).timeoutMs(5_000).get();
    expect(calls).toHaveLength(1);
  });
});

describe("terminals", () => {
  it("reads one subscription and one delivery", async () => {
    const { client, calls } = harnessReturning({ subscription: { id: "sub_1" } }, { id: "whd_1" });
    await client.subscriptions.subscription("sub_1").get();
    await client.webhooks.delivery("whd_1").get();
    expect(calls.map((call) => call.method)).toEqual(["GET", "GET"]);
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      "/v1/subscriptions/sub_1",
      "/v1/webhook-deliveries/whd_1",
    ]);
  });

  it("creates a subscription whose activation is pending", async () => {
    const { client, calls } = harnessReturning({});
    await client.subscriptions
      .create()
      .customerId("cus_1")
      .name("Gold")
      .priceId("price_1")
      .pending()
      .create();
    expect(callAt(calls, 0).body).toMatchObject({ activation: { state: "pending" } });
  });

  it("creates an endpoint carrying its description", async () => {
    const { client, calls } = harnessReturning({});
    await client.webhooks
      .createEndpoint()
      .url("https://shop.test/hooks")
      .description("order hooks")
      .create();
    expect(callAt(calls, 0).body).toMatchObject({ description: "order hooks" });
  });

  it("filters prices by their active state", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null });
    await client.catalogue.prices().active(false).get();
    expect(queryOf(callAt(calls, 0))).toBe("?active=false");
  });

  it("walks the remaining paginated lists", async () => {
    const pages = [
      { data: [{ id: "a" }], nextCursor: "cur_2", hasMore: true },
      { data: [{ id: "b" }], nextCursor: null, hasMore: false },
    ];
    const walks: Record<string, (client: Client) => AsyncGenerator<{ id: string }>> = {
      subscriptions: (client) => client.subscriptions.list().all(),
      priceMigrations: (client) => client.priceMigrations.list().all(),
      prices: (client) => client.catalogue.prices().all(),
      crossSells: (client) => client.catalogue.crossSells("prod_1").all(),
      shippingRates: (client) =>
        client.checkout
          .shippingRates()
          .currency("EUR")
          .destinationCountry("PT")
          .product("prod_1")
          .all(),
    };
    for (const [name, walk] of Object.entries(walks)) {
      const { client } = harnessReturning(...pages);
      const collected: string[] = [];
      for await (const item of walk(client)) {
        collected.push(item.id);
      }
      expect(collected, name).toEqual(["a", "b"]);
    }
  });
});
