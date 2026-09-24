import { describe, expect, it } from "vitest";
import { harnessReturning } from "./support/harness";

describe("builder contract", () => {
  it("freezes every builder the client hands back", () => {
    const { client } = harnessReturning();
    const builders = [
      client.catalogue.products(),
      client.catalogue.product("prod_1"),
      client.customers.list(),
      client.customers.create(),
      client.customers.customer("cus_1"),
      client.checkout.coupon("WELCOME"),
      client.checkout.taxRates(),
      client.checkout.shippingRates(),
      client.checkout.subscriptionSession(),
      client.payments.create(),
      client.payments.list(),
      client.invoices.list(),
      client.refunds.create(),
      client.subscriptions.create(),
      client.subscriptions.subscription("sub_1"),
      client.priceMigrations.list(),
      client.priceMigrations.migration("mig_1"),
      client.events.list(),
      client.webhooks.createEndpoint(),
      client.webhooks.deliveries(),
    ];
    for (const builder of builders) {
      expect(Object.isFrozen(builder)).toBe(true);
    }
  });

  it("freezes the client itself", () => {
    const { client } = harnessReturning();
    expect(Object.isFrozen(client)).toBe(true);
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
    expect(calls[0]?.body).toEqual({ customerId: "cus_1", priceId: "price_1" });
    expect(calls[1]?.body).toEqual({
      customerId: "cus_1",
      priceId: "price_1",
      description: "second",
    });
  });

  it("issues no request until a terminal is called", () => {
    const { client, calls } = harnessReturning();
    client.catalogue.products().active(true).limit(10);
    client.customers.create().email("buyer@example.test");
    client.payments.create().customerId("cus_1").priceId("price_1");
    client.subscriptions.subscription("sub_1").cancellation().timing("period_end");
    client.webhooks.createEndpoint().url("https://shop.test/hooks");
    expect(calls).toHaveLength(0);
  });

  it("issues no request until the walk is pulled", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null });
    const walk = client.customers.list().all();
    expect(calls).toHaveLength(0);
    await walk.next();
    expect(calls).toHaveLength(1);
  });
});
