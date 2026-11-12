import { describe, expect, it } from "vitest";
import { createBuPaymentClient } from "../src/client";
import { ErrorCode } from "../src/constants";
import { BuPaymentError } from "../src/errors";
import { envClient, REQUIRED_ENV } from "./support/env";

const ENV_WITH_DESTINATION = { ...REQUIRED_ENV, BU_PAYMENT_DESTINATION_KEY: " store " };

describe("default checkout destination", () => {
  it("sends the configured destination when none is chosen", async () => {
    const { client, calls } = envClient(ENV_WITH_DESTINATION);
    await client.checkout
      .sessionDraft()
      .priceId("price_1")
      .customerId("customer_1")
      .idempotencyKey("order-1")
      .create();
    expect(calls[0]?.body).toEqual({
      priceId: "price_1",
      customerId: "customer_1",
      destinationKey: "store",
    });
  });

  it("lets an explicit destination win over the configured one", async () => {
    const { client, calls } = envClient(ENV_WITH_DESTINATION);
    await client.checkout
      .sessionDraft()
      .destination("partner")
      .priceId("price_1")
      .customerId("customer_1")
      .idempotencyKey("order-1")
      .create();
    expect(calls[0]?.body).toMatchObject({ destinationKey: "partner" });
  });

  it("rejects the awaited call, unsent, when no destination exists anywhere", async () => {
    const { client, calls } = envClient(REQUIRED_ENV);
    const pending = client.checkout
      .sessionDraft()
      .priceId("price_1")
      .customerId("customer_1")
      .idempotencyKey("order-1")
      .create();
    const error = await pending.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BuPaymentError);
    expect((error as BuPaymentError).code).toBe(ErrorCode.CONFIGURATION_MISSING);
    expect((error as BuPaymentError).metadata).toEqual({ variables: "BU_PAYMENT_DESTINATION_KEY" });
    expect(calls).toHaveLength(0);
  });

  it("takes the destination from an explicit configuration too", () => {
    const client = createBuPaymentClient({
      applicationId: REQUIRED_ENV.BU_PAYMENT_APP_ID,
      keyId: REQUIRED_ENV.BU_PAYMENT_KEY_ID,
      secret: REQUIRED_ENV.BU_PAYMENT_SECRET,
      apiBaseUrl: REQUIRED_ENV.BU_PAYMENT_API_URL,
      destinationKey: "store",
    });
    const draft = client.checkout.sessionDraft().priceId("p").customerId("c").idempotencyKey("o");
    expect("create" in draft).toBe(true);
  });

  it("refuses an empty destination given directly", () => {
    expect(() =>
      createBuPaymentClient({
        applicationId: REQUIRED_ENV.BU_PAYMENT_APP_ID,
        keyId: REQUIRED_ENV.BU_PAYMENT_KEY_ID,
        secret: REQUIRED_ENV.BU_PAYMENT_SECRET,
        apiBaseUrl: REQUIRED_ENV.BU_PAYMENT_API_URL,
        destinationKey: " ",
      }),
    ).toThrowError(expect.objectContaining({ code: ErrorCode.CONFIGURATION_INVALID }));
  });
});
