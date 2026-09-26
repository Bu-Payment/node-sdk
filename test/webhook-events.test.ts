import { describe, expect, it } from "vitest";
import { ErrorCode } from "../src/constants";
import catalogueEvents from "./fixtures/catalogue-events.json";
import {
  deliver,
  type Envelope,
  failure,
  PRICE_EVENT,
  PRODUCT_EVENT,
  TIMESTAMP,
  withResource,
} from "./support/webhook-events";

describe("typed webhook events", () => {
  it("covers every documented catalogue type once", () => {
    expect(new Set(catalogueEvents.map((event) => event.type)).size).toBe(13);
  });

  it.each(
    catalogueEvents.map((event) => [event.type, event] as const),
  )("returns %s as a typed catalogue event", (_type, envelope) => {
    const { event } = deliver(envelope);

    expect(event).toEqual(envelope);
    expect(event.type).toBe(envelope.type);
  });

  it("narrows a product event to the product with its default price", () => {
    const { event } = deliver(PRODUCT_EVENT);

    if (event.type !== "catalogue.product.created.v1") {
      throw new Error("expected a product event");
    }
    expect(event.data.resourceType).toBe("product");
    expect(event.data.resource.defaultPriceId).toBe("5f1e0000-0000-4000-8000-000000000002");
  });

  it("narrows a price event to the price", () => {
    const { event } = deliver(PRICE_EVENT);

    if (event.type !== "catalogue.price.created.v1") {
      throw new Error("expected a price event");
    }
    expect(event.data.resource.recurring).toEqual({ interval: "month", intervalCount: 1 });
  });

  it("accepts a one-time price and a product without a default price", () => {
    const oneTime = withResource(PRICE_EVENT, { type: "one_time", recurring: null });
    const noDefault = withResource(PRODUCT_EVENT, { defaultPriceId: null, lookupKey: null });

    expect(deliver(oneTime).event.data).toEqual(oneTime.data);
    expect(deliver(noDefault).event.data).toEqual(noDefault.data);
  });

  it("returns an unknown type as a value with its raw data", () => {
    const envelope = {
      version: 1,
      id: "evt_99",
      type: "payment.succeeded.v1",
      occurredAt: "2026-09-25T10:00:00.000Z",
      data: { paymentId: "pay_1", amount: 1500 },
    };

    expect(deliver(envelope).event).toEqual({
      version: 1,
      id: "evt_99",
      type: "unknown",
      receivedType: "payment.succeeded.v1",
      occurredAt: "2026-09-25T10:00:00.000Z",
      data: { paymentId: "pay_1", amount: 1500 },
    });
  });

  it("returns an unknown type whatever shape its data has", () => {
    expect(
      deliver({ ...PRODUCT_EVENT, type: "catalogue.product.merged.v2", data: null }).event,
    ).toMatchObject({ type: "unknown", receivedType: "catalogue.product.merged.v2", data: null });
  });

  it.each([
    "constructor",
    "toString",
    "__proto__",
  ])("reads the inherited property name %s as an unknown type", (type) => {
    expect(deliver({ ...PRODUCT_EVENT, type }).event).toMatchObject({
      type: "unknown",
      receivedType: type,
    });
  });

  it.each([
    ["an unversioned body", { resourceType: "product", resourceId: "prod_1" }, undefined],
    ["version 2", { ...PRODUCT_EVENT, version: 2 }, { version: 2 }],
    ["version 0", { ...PRODUCT_EVENT, version: 0 }, { version: 0 }],
    ["version as a string", { ...PRODUCT_EVENT, version: "1" }, undefined],
  ])("refuses %s rather than reading it as version 1", (_name, envelope, metadata) => {
    const error = failure(envelope);

    expect(error.code).toBe(ErrorCode.WEBHOOK_EVENT_VERSION_UNSUPPORTED);
    expect(error.metadata).toEqual(metadata);
  });

  it.each<[string, Envelope, string]>([
    ["a missing id", { ...PRODUCT_EVENT, id: undefined }, "id"],
    ["an empty type", { ...PRODUCT_EVENT, type: "" }, "type"],
    ["an unreadable occurredAt", { ...PRODUCT_EVENT, occurredAt: "yesterday" }, "occurredAt"],
    [
      "an occurredAt with an offset",
      { ...PRODUCT_EVENT, occurredAt: "2026-09-24T11:00:05.123+01:00" },
      "occurredAt",
    ],
    [
      "an occurredAt without milliseconds",
      { ...PRODUCT_EVENT, occurredAt: "2026-09-24T10:00:05Z" },
      "occurredAt",
    ],
    ["a bare year as occurredAt", { ...PRODUCT_EVENT, occurredAt: "2026" }, "occurredAt"],
    ["no data", { ...PRODUCT_EVENT, data: undefined }, "data"],
  ])("refuses an envelope with %s", (_name, envelope, field) => {
    const error = failure(envelope);

    expect(error.code).toBe(ErrorCode.WEBHOOK_EVENT_INVALID);
    expect(error.metadata?.field).toBe(field);
  });

  it("keeps a malformed event apart from a signature failure", () => {
    const error = failure(withResource(PRODUCT_EVENT, { name: null }));

    expect(error.code).toBe(ErrorCode.WEBHOOK_EVENT_INVALID);
    expect(error.message).toContain("data.resource.name");
  });

  it.each([
    ["an unsupported version", { ...PRODUCT_EVENT, version: 2 }],
    ["malformed data", withResource(PRODUCT_EVENT, { name: null })],
  ])("reports a forged delivery with %s as a signature failure", (_name, envelope) => {
    const error = failure(envelope, { signature: "0".repeat(64) });

    expect(error.code).toBe(ErrorCode.WEBHOOK_SIGNATURE_INVALID);
  });

  it.each([
    ["an unsupported version", { ...PRODUCT_EVENT, version: 2 }],
    ["malformed data", withResource(PRODUCT_EVENT, { name: null })],
  ])("reports a stale delivery with %s as expired", (_name, envelope) => {
    const error = failure(envelope, { now: Number(TIMESTAMP) + 3_600_000 });

    expect(error.code).toBe(ErrorCode.WEBHOOK_TIMESTAMP_EXPIRED);
  });
});
