import { describe, expect, it } from "vitest";
import type { BuPaymentClient } from "../src/client";
import { ErrorCode } from "../src/constants";
import { createCustomersClient } from "../src/customers/client";
import { harnessReturning } from "./support/harness";

const TERMINALS_ON_AN_EMPTY_SEGMENT: Record<string, (client: BuPaymentClient) => Promise<unknown>> =
  {
    "catalogue.product.get": (c) => c.catalogue.product("").get(),
    "catalogue.price.get": (c) => c.catalogue.price("").get(),
    "catalogue.crossSells.get": (c) => c.catalogue.crossSells("").get(),
    "catalogue.crossSells.all": (c) => c.catalogue.crossSells("").all().next(),
    "catalogue.entitlements.get": (c) => c.catalogue.entitlements("").get(),
    "catalogue.updateProduct.update": (c) => c.catalogue.updateProduct("").name("Plan").update(),
    "catalogue.archiveProduct.archive": (c) => c.catalogue.archiveProduct("").archive(),
    "catalogue.reactivateProduct.reactivate": (c) => c.catalogue.reactivateProduct("").reactivate(),
    "catalogue.createPrice.create": (c) =>
      c.catalogue.createPrice("").unitAmount(1_000).currency("EUR").create(),
    "catalogue.createPrice.replace": (c) =>
      c.catalogue.createPrice("prod_1").unitAmount(1_000).currency("EUR").replacing("").replace(),
    "catalogue.archivePrice.archive": (c) => c.catalogue.archivePrice("").archive(),
    "catalogue.reactivatePrice.reactivate": (c) => c.catalogue.reactivatePrice("").reactivate(),
    "customers.customer.get": (c) => c.customers.customer("").get(),
    "customers.customer.update": (c) => c.customers.customer("").name("Buyer").update(),
    "checkout.taxRate.calculate": (c) =>
      c.checkout.taxRate("").amount(1_000).productId("prod_1").calculate(),
    "payments.payment.get": (c) => c.payments.payment("").get(),
    "paymentMethods.list.get": (c) => c.paymentMethods.list("").get(),
    "paymentMethods.paymentMethod.get on the customer": (c) =>
      c.paymentMethods.paymentMethod("", "pm_1").get(),
    "paymentMethods.paymentMethod.get": (c) => c.paymentMethods.paymentMethod("cus_1", "").get(),
    "paymentMethods.paymentMethod.revoke": (c) =>
      c.paymentMethods.paymentMethod("cus_1", "").revoke(),
    "paymentMethods.createSetup.create": (c) =>
      c.paymentMethods
        .createSetup("")
        .currency("EUR")
        .returnUrl("https://shop.test/r")
        .consentAcceptedAt("2026-01-01T00:00:00Z")
        .create(),
    "invoices.invoice.get": (c) => c.invoices.invoice("").get(),
    "refunds.refund.get": (c) => c.refunds.refund("").get(),
    "subscriptions.subscription.get": (c) => c.subscriptions.subscription("").get(),
    "subscriptions.cancellation.cancel": (c) =>
      c.subscriptions.subscription("").cancellation().timing("immediate").cancel(),
    "subscriptions.pauseSubscription.pause": (c) =>
      c.subscriptions
        .subscription("")
        .pauseSubscription()
        .effectiveTiming("immediate")
        .resumeBillingPolicy("startNewBillingPeriod")
        .pause(),
    "subscriptions.pausePaymentCollection.pause": (c) =>
      c.subscriptions.subscription("").pausePaymentCollection().behavior("void").pause(),
    "subscriptions.resumePendingCancellation.resume": (c) =>
      c.subscriptions.subscription("").resumePendingCancellation().resume(),
    "subscriptions.resumePausedSubscription.resume": (c) =>
      c.subscriptions
        .subscription("")
        .resumePausedSubscription()
        .immediately()
        .billingPolicy("startNewBillingPeriod")
        .resume(),
    "subscriptions.resumePaymentCollection.resume": (c) =>
      c.subscriptions.subscription("").resumePaymentCollection().resume(),
    "subscriptions.scheduledChange.cancel": (c) =>
      c.subscriptions.subscription("").scheduledChange().cancel(),
    "subscriptions.priceMigration.create": (c) =>
      c.subscriptions
        .subscription("")
        .priceMigration()
        .targetPriceId("price_2")
        .immediately()
        .prorationPolicy("prorateImmediately")
        .paymentFailurePolicy("preventChange")
        .create(),
    "priceMigrations.migration.get": (c) => c.priceMigrations.migration("").get(),
    "priceMigrations.migration.approve": (c) => c.priceMigrations.migration("").approve(),
    "priceMigrations.migration.cancel": (c) => c.priceMigrations.migration("").cancel(),
    "priceMigrations.migration.retry": (c) => c.priceMigrations.migration("").retry(),
    "priceMigrations.migration.settle": (c) => c.priceMigrations.migration("").settle(),
    "priceMigrations.notificationPlan.get": (c) =>
      c.priceMigrations.migration("").notificationPlan().get(),
    "priceMigrations.notificationPlan.retry": (c) =>
      c.priceMigrations.migration("mig_1").notificationPlan().version(1).channel("").retry(),
    "priceMigrations.notificationPlan.reschedule": (c) =>
      c.priceMigrations
        .migration("")
        .notificationPlan()
        .version(1)
        .availableAt("2026-01-01T00:00:00Z")
        .reschedule(),
    "events.event.get": (c) => c.events.event("").get(),
    "webhooks.endpoint.get": (c) => c.webhooks.endpoint("").get(),
    "webhooks.endpoint.remove": (c) => c.webhooks.endpoint("").remove(),
    "webhooks.endpoint.update": (c) =>
      c.webhooks.endpoint("").url("https://shop.test/hooks").update(),
    "webhooks.delivery.get": (c) => c.webhooks.delivery("").get(),
    "webhooks.delivery.retry": (c) => c.webhooks.delivery("").retry(),
  };

describe("terminal rejection", () => {
  it.each(
    Object.entries(TERMINALS_ON_AN_EMPTY_SEGMENT),
  )("rejects %s on an empty path segment without issuing a request", async (_name, terminal) => {
    const { client, calls } = harnessReturning();
    await expect(terminal(client)).rejects.toMatchObject({ code: ErrorCode.REQUEST_INVALID });
    expect(calls).toHaveLength(0);
  });

  it("rejects an empty path segment from a client factory used on its own", async () => {
    const requests: unknown[] = [];
    const customers = createCustomersClient(async <T>(request: unknown) => {
      requests.push(request);
      return {} as T;
    });
    await expect(customers.customer("").get()).rejects.toMatchObject({
      code: ErrorCode.REQUEST_INVALID,
    });
    expect(requests).toHaveLength(0);
  });
});
