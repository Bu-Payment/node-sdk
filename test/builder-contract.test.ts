import { describe, expect, it } from "vitest";
import { callAt, harnessReturning, harnessStalling, queryOf } from "./support/harness";

function everyBuilder(client: ReturnType<typeof harnessReturning>["client"]): unknown[] {
  const subscription = client.subscriptions.subscription("sub_1");
  const migration = client.priceMigrations.migration("mig_1");
  return [
    client.catalogue.products(),
    client.catalogue.products().active(true).limit(5),
    client.catalogue.product("prod_1"),
    client.catalogue.prices(),
    client.catalogue.price("price_1"),
    client.catalogue.crossSells("prod_1"),
    client.catalogue.entitlements("prod_1"),
    client.catalogue.products().lookupKey("gold"),
    client.catalogue.createProduct(),
    client.catalogue.createProduct().name("Gold"),
    client.catalogue.updateProduct("prod_1"),
    client.catalogue.updateProduct("prod_1").name("Gold").expectedUpdatedAt("2026-01-01T00:00:00Z"),
    client.catalogue.archiveProduct("prod_1"),
    client.catalogue.archiveProduct("prod_1").expectedUpdatedAt("2026-01-01T00:00:00Z"),
    client.catalogue.reactivateProduct("prod_1"),
    client.catalogue.createPrice("prod_1"),
    client.catalogue.createPrice("prod_1").unitAmount(1).currency("EUR").interval("month"),
    client.catalogue.createPrice("prod_1").unitAmount(1).currency("EUR").replacing("price_1"),
    client.catalogue.archivePrice("price_1"),
    client.catalogue.reactivatePrice("price_1").idempotencyKey("k-1"),
    client.customers.list(),
    client.customers.create(),
    client.customers.create().email("buyer@example.test"),
    client.customers.customer("cus_1"),
    client.checkout.coupon("WELCOME"),
    client.checkout.coupon("WELCOME").unitAmount(1).currency("EUR"),
    client.checkout.taxRates(),
    client.checkout.taxRate("txr_1"),
    client.checkout.shippingRates(),
    client.checkout.shippingRates().currency("EUR").destinationCountry("PT").product("prod_1"),
    client.checkout.subscriptionSession(),
    client.payments.create(),
    client.payments.create().customerId("cus_1").priceId("price_1"),
    client.payments.list(),
    client.payments.payment("pay_1"),
    client.paymentMethods.createSetup("cus_1"),
    client.paymentMethods.createSetup("cus_1").currency("EUR").returnUrl("https://shop.test/r"),
    client.paymentMethods.list("cus_1"),
    client.paymentMethods.paymentMethod("cus_1", "pm_1"),
    client.billing.capabilities(),
    client.invoices.list(),
    client.invoices.invoice("inv_1"),
    client.refunds.list(),
    client.refunds.refund("ref_1"),
    client.refunds.create(),
    client.subscriptions.list(),
    client.subscriptions.create(),
    subscription,
    subscription.cancellation(),
    subscription.cancellation().timing("immediate"),
    subscription.pauseSubscription(),
    subscription.pausePaymentCollection(),
    subscription.resumePendingCancellation(),
    subscription.resumePausedSubscription(),
    subscription.resumePaymentCollection(),
    subscription.scheduledChange(),
    subscription.priceMigration(),
    client.priceMigrations.list(),
    migration,
    migration.notificationPlan(),
    migration.notificationPlan().version(1),
    client.events.list(),
    client.events.event("evt_1"),
    client.webhooks.endpoints(),
    client.webhooks.createEndpoint(),
    client.webhooks.endpoint("whe_1"),
    client.webhooks.deliveries(),
    client.webhooks.delivery("whd_1"),
  ];
}

describe("builder contract", () => {
  it("freezes the client and every builder reachable from it", () => {
    const { client } = harnessReturning();
    expect(Object.isFrozen(client)).toBe(true);
    for (const builder of everyBuilder(client)) {
      expect(Object.isFrozen(builder)).toBe(true);
    }
  });

  it("issues no request while any of those builders is merely configured", () => {
    const { client, calls } = harnessReturning();
    everyBuilder(client);
    expect(calls).toHaveLength(0);
  });

  it("returns a new builder from every configuration method", () => {
    const { client } = harnessReturning();
    const base = client.payments.create();
    const withCustomer = base.customerId("cus_1");
    const withPrice = withCustomer.priceId("price_1");
    expect(withCustomer).not.toBe(base);
    expect(withPrice).not.toBe(withCustomer);
  });

  it("leaves an earlier builder unchanged when a later one adds a field", async () => {
    const { client, calls } = harnessReturning({ id: "pay_1" }, { id: "pay_2" });
    const base = client.payments.create().customerId("cus_1").priceId("price_1");
    const described = base.description("second");
    await base.create();
    await described.create();
    expect(callAt(calls, 0).body).toEqual({ customerId: "cus_1", priceId: "price_1" });
    expect(callAt(calls, 1).body).toEqual({
      customerId: "cus_1",
      priceId: "price_1",
      description: "second",
    });
  });

  it("does not let one branch of an accumulating builder reach another", async () => {
    const { client, calls } = harnessReturning({}, {});
    const base = client.payments
      .create()
      .customerId("cus_1")
      .priceId("price_1")
      .paymentMethodId("pm_1")
      .allocation("line_1", 100, "EUR");
    await base.allocation("line_2", 200, "EUR").create();
    await base.allocation("line_3", 300, "EUR").create();
    expect(callAt(calls, 0).body).toMatchObject({
      allocations: [
        { reference: "line_1", amount: 100, currency: "EUR" },
        { reference: "line_2", amount: 200, currency: "EUR" },
      ],
    });
    expect(callAt(calls, 1).body).toMatchObject({
      allocations: [
        { reference: "line_1", amount: 100, currency: "EUR" },
        { reference: "line_3", amount: 300, currency: "EUR" },
      ],
    });
  });

  it("does not let one branch of a payment method setup reach another", async () => {
    const { client, calls } = harnessReturning({}, {});
    const base = client.paymentMethods
      .createSetup("cus_1")
      .currency("EUR")
      .returnUrl("https://shop.test/r")
      .consentAcceptedAt("2026-01-01T00:00:00Z");
    await base.replacesPaymentMethodId("pm_old").idempotencyKey("setup-a").create();
    await base.create();
    expect(calls).toHaveLength(2);
    expect(callAt(calls, 0).headers["Idempotency-Key"]).toBe("setup-a");
    expect(callAt(calls, 0).body).toMatchObject({ replacesPaymentMethodId: "pm_old" });
    expect(callAt(calls, 1).headers["Idempotency-Key"]).not.toBe("setup-a");
    expect(callAt(calls, 1).body).not.toHaveProperty("replacesPaymentMethodId");
  });

  it("does not let one branch of a price draft reach another", async () => {
    const { client, calls } = harnessReturning({}, {});
    const base = client.catalogue.createPrice("prod_1").unitAmount(1_000).currency("EUR");
    await base.interval("month").create();
    await base.lookupKey("gold").create();
    expect(callAt(calls, 0).body).toEqual({
      unitAmount: 1_000,
      currency: "EUR",
      recurring: { interval: "month" },
    });
    expect(callAt(calls, 1).body).toEqual({
      unitAmount: 1_000,
      currency: "EUR",
      lookupKey: "gold",
    });
  });

  it("does not let one branch of an accumulating webhook builder reach another", async () => {
    const { client, calls } = harnessReturning({}, {});
    const base = client.webhooks.createEndpoint().url("https://shop.test/hooks").event("a");
    await base.event("b").create();
    await base.event("c").create();
    expect(callAt(calls, 0).body).toMatchObject({ enabledEvents: ["a", "b"] });
    expect(callAt(calls, 1).body).toMatchObject({ enabledEvents: ["a", "c"] });
  });

  it("does not let one branch of an accumulating shipping builder reach another", async () => {
    const { client, calls } = harnessReturning(
      { data: [], nextCursor: null },
      { data: [], nextCursor: null },
    );
    const base = client.checkout
      .shippingRates()
      .currency("EUR")
      .destinationCountry("PT")
      .product("prod_1");
    await base.product("prod_2").get();
    await base.product("prod_3").get();
    expect(queryOf(callAt(calls, 0))).toContain("productIds=prod_1%2Cprod_2");
    expect(queryOf(callAt(calls, 1))).toContain("productIds=prod_1%2Cprod_3");
  });

  it("issues no request until the walk is pulled", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null });
    const walk = client.customers.list().all();
    expect(calls).toHaveLength(0);
    await walk.next();
    expect(calls).toHaveLength(1);
  });

  it("carries the abort signal the builder was given into the request", async () => {
    const { client, calls } = harnessStalling();
    const controller = new AbortController();
    controller.abort();
    await expect(
      client.events.event("evt_1").signal(controller.signal).get(),
    ).rejects.toMatchObject({ code: "request_cancelled" });
    expect(calls).toHaveLength(1);
  });

  it("carries the timeout the builder was given into the request", async () => {
    const { client, calls } = harnessStalling();
    await expect(client.catalogue.products().timeoutMs(5).get()).rejects.toMatchObject({
      code: "network_unavailable",
      metadata: { timeoutMs: 5 },
    });
    expect(calls).toHaveLength(1);
  });
});
