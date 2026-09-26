import { describe, expect, it } from "vitest";
import { ErrorCode } from "../src/constants";
import {
  type Envelope,
  failure,
  PRICE_EVENT,
  PRODUCT_EVENT,
  withData,
  withResource,
} from "./support/webhook-events";

describe("catalogue event validation", () => {
  it.each<[string, Envelope, string]>([
    ["data that is not an object", { ...PRODUCT_EVENT, data: [] }, "data"],
    [
      "a price resourceType",
      withData(PRODUCT_EVENT, { resourceType: "price" }),
      "data.resourceType",
    ],
    ["no updatedAt", withData(PRODUCT_EVENT, { updatedAt: undefined }), "data.updatedAt"],
    ["no resourceId", withData(PRODUCT_EVENT, { resourceId: undefined }), "data.resourceId"],
    ["no occurredAt", withData(PRODUCT_EVENT, { occurredAt: undefined }), "data.occurredAt"],
    [
      "an occurredAt that is not the envelope's",
      withData(PRODUCT_EVENT, { occurredAt: "2026-09-24T10:00:06.000Z" }),
      "data.occurredAt",
    ],
    ["no resource", withData(PRODUCT_EVENT, { resource: null }), "data.resource"],
    [
      "a resourceId of another product",
      withData(PRODUCT_EVENT, { resourceId: "prod_2" }),
      "data.resourceId",
    ],
    [
      "an updatedAt that is not the resource's",
      withData(PRODUCT_EVENT, { updatedAt: "2026-09-24T10:00:06.000Z" }),
      "data.updatedAt",
    ],
    ["a product without a name", withResource(PRODUCT_EVENT, { name: 1 }), "data.resource.name"],
    [
      "a numeric description",
      withResource(PRODUCT_EVENT, { description: 1 }),
      "data.resource.description",
    ],
    [
      "a textual active flag",
      withResource(PRODUCT_EVENT, { active: "true" }),
      "data.resource.active",
    ],
    [
      "no defaultPriceId",
      withResource(PRODUCT_EVENT, { defaultPriceId: undefined }),
      "data.resource.defaultPriceId",
    ],
    [
      "an unreadable createdAt",
      withResource(PRODUCT_EVENT, { createdAt: "soon" }),
      "data.resource.createdAt",
    ],
    ["no id", withResource(PRODUCT_EVENT, { id: undefined }), "data.resource.id"],
    [
      "a numeric lookupKey",
      withResource(PRODUCT_EVENT, { lookupKey: 7 }),
      "data.resource.lookupKey",
    ],
    [
      "an unreadable resource updatedAt",
      withResource(PRODUCT_EVENT, { updatedAt: "soon" }),
      "data.resource.updatedAt",
    ],
  ])("refuses a product event with %s", (_name, envelope, field) => {
    const error = failure(envelope);

    expect(error.code).toBe(ErrorCode.WEBHOOK_EVENT_INVALID);
    expect(error.metadata).toEqual({
      eventId: "evt_01",
      eventType: "catalogue.product.created.v1",
      field,
    });
  });

  it.each<[string, Envelope, string]>([
    [
      "a product resourceType",
      withData(PRICE_EVENT, { resourceType: "product" }),
      "data.resourceType",
    ],
    [
      "a fractional amount",
      withResource(PRICE_EVENT, { unitAmount: 15.5 }),
      "data.resource.unitAmount",
    ],
    [
      "a negative amount",
      withResource(PRICE_EVENT, { unitAmount: -1 }),
      "data.resource.unitAmount",
    ],
    [
      "an amount given as text",
      withResource(PRICE_EVENT, { unitAmount: "1500" }),
      "data.resource.unitAmount",
    ],
    ["no currency", withResource(PRICE_EVENT, { currency: "" }), "data.resource.currency"],
    ["an unknown price type", withResource(PRICE_EVENT, { type: "metered" }), "data.resource.type"],
    [
      "no recurring field",
      withResource(PRICE_EVENT, { recurring: undefined }),
      "data.resource.recurring",
    ],
    [
      "an unknown interval",
      withResource(PRICE_EVENT, { recurring: { interval: "fortnight", intervalCount: 1 } }),
      "data.resource.recurring.interval",
    ],
    [
      "a zero interval count",
      withResource(PRICE_EVENT, { recurring: { interval: "month", intervalCount: 0 } }),
      "data.resource.recurring.intervalCount",
    ],
    ["no productId", withResource(PRICE_EVENT, { productId: null }), "data.resource.productId"],
    ["no id", withResource(PRICE_EVENT, { id: "" }), "data.resource.id"],
    [
      "a recurring field that is text",
      withResource(PRICE_EVENT, { recurring: "month" }),
      "data.resource.recurring",
    ],
    [
      "a fractional interval count",
      withResource(PRICE_EVENT, { recurring: { interval: "month", intervalCount: 1.5 } }),
      "data.resource.recurring.intervalCount",
    ],
    [
      "a numeric description",
      withResource(PRICE_EVENT, { description: 0 }),
      "data.resource.description",
    ],
    [
      "a boolean lookupKey",
      withResource(PRICE_EVENT, { lookupKey: false }),
      "data.resource.lookupKey",
    ],
    [
      "a textual active flag",
      withResource(PRICE_EVENT, { active: "false" }),
      "data.resource.active",
    ],
    [
      "an unreadable createdAt",
      withResource(PRICE_EVENT, { createdAt: "2026-02-30T00:00:00.000Z" }),
      "data.resource.createdAt",
    ],
    [
      "an unreadable resource updatedAt",
      withResource(PRICE_EVENT, { updatedAt: null }),
      "data.resource.updatedAt",
    ],
  ])("refuses a price event with %s", (_name, envelope, field) => {
    const error = failure(envelope);

    expect(error.code).toBe(ErrorCode.WEBHOOK_EVENT_INVALID);
    expect(error.metadata).toEqual({
      eventId: "evt_08",
      eventType: "catalogue.price.created.v1",
      field,
    });
  });
});
