import { describe, expect, it } from "vitest";
import { envClient, REQUIRED_ENV } from "./support/env";

const ENV_WITH_DESTINATION = { ...REQUIRED_ENV, BU_PAYMENT_DESTINATION_KEY: "store" };

describe("client from the environment, builder contract", () => {
  it("is frozen and issues no request when created", () => {
    const { client, calls } = envClient(ENV_WITH_DESTINATION);
    expect(Object.isFrozen(client)).toBe(true);
    expect(Object.isFrozen(client.checkout)).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("returns a new frozen draft for an explicit destination and keeps the default one", async () => {
    const { client, calls } = envClient(ENV_WITH_DESTINATION);
    const base = client.checkout.sessionDraft().priceId("p").customerId("c").idempotencyKey("o");
    const explicit = base.destination("partner");
    expect(explicit).not.toBe(base);
    expect(Object.isFrozen(base)).toBe(true);
    expect(Object.isFrozen(explicit)).toBe(true);
    await base.create();
    expect(calls[0]?.body).toMatchObject({ destinationKey: "store" });
  });

  it("offers create without destination() only on a client from the environment", () => {
    const { client } = envClient(REQUIRED_ENV);
    const draft = client.checkout.sessionDraft().priceId("p").customerId("c");
    expect("create" in draft).toBe(false);
    expect("create" in draft.idempotencyKey("o")).toBe(true);
  });

  it("issues no request until create is awaited", () => {
    const { client, calls } = envClient(ENV_WITH_DESTINATION);
    client.checkout.sessionDraft().priceId("p").customerId("c").idempotencyKey("o");
    expect(calls).toHaveLength(0);
  });
});
