import type { Price, PriceInterval } from "../catalogue/types";
import { ErrorCode } from "../constants";
import { BuPaymentError } from "../errors";
import { assertCheckoutData, CHECKOUT_EVENT_STATUSES } from "./checkout-events";
import {
  booleanField,
  fieldRejecter,
  integerField,
  isKey,
  type JsonObject,
  nullableTextField,
  objectField,
  type RejectField,
  requiredTextField,
  timestampField,
} from "./fields";
import type {
  CatalogueEvent,
  CataloguePriceEventType,
  CatalogueProductEventType,
  CheckoutEvent,
  WebhookEvent,
} from "./types";

type CatalogueResourceType = "product" | "price";

const CATALOGUE_EVENT_RESOURCES: { readonly [T in CatalogueProductEventType]: "product" } & {
  readonly [T in CataloguePriceEventType]: "price";
} = {
  "catalogue.product.created.v1": "product",
  "catalogue.product.updated.v1": "product",
  "catalogue.product.archived.v1": "product",
  "catalogue.product.reactivated.v1": "product",
  "catalogue.product.default_price.updated.v1": "product",
  "catalogue.product.assigned.v1": "product",
  "catalogue.product.unassigned.v1": "product",
  "catalogue.price.created.v1": "price",
  "catalogue.price.updated.v1": "price",
  "catalogue.price.archived.v1": "price",
  "catalogue.price.reactivated.v1": "price",
  "catalogue.price.assigned.v1": "price",
  "catalogue.price.unassigned.v1": "price",
};

const RESOURCE_ASSERTIONS: Readonly<
  Record<CatalogueResourceType, (resource: JsonObject, rejectField: RejectField) => void>
> = {
  product: assertProduct,
  price: assertPrice,
};

const PRICE_TYPES: Readonly<Record<Price["type"], true>> = { one_time: true, recurring: true };

const PRICE_INTERVALS: Readonly<Record<PriceInterval, true>> = {
  day: true,
  week: true,
  month: true,
  year: true,
};

export function parseWebhookEvent(payload: JsonObject): WebhookEvent {
  if (payload.version !== 1) {
    throw new BuPaymentError("Webhook event version is not supported by this SDK", {
      code: ErrorCode.WEBHOOK_EVENT_VERSION_UNSUPPORTED,
      ...(typeof payload.version === "number" ? { metadata: { version: payload.version } } : {}),
    });
  }
  const rejectField = fieldRejecter(payload);
  const id = requiredTextField(payload, "id", "", rejectField);
  const type = requiredTextField(payload, "type", "", rejectField);
  const occurredAt = timestampField(payload, "occurredAt", "", rejectField);
  if (!("data" in payload)) {
    rejectField("data");
  }
  if (isKey(CATALOGUE_EVENT_RESOURCES, type)) {
    assertCatalogueData(payload.data, CATALOGUE_EVENT_RESOURCES[type], occurredAt, rejectField);
    return { version: 1, id, type, occurredAt, data: payload.data } as CatalogueEvent;
  }
  if (isKey(CHECKOUT_EVENT_STATUSES, type)) {
    assertCheckoutData(payload.data, type, rejectField);
    return { version: 1, id, type, occurredAt, data: payload.data } as CheckoutEvent;
  }
  return { version: 1, id, type: "unknown", receivedType: type, occurredAt, data: payload.data };
}

function assertCatalogueData(
  value: unknown,
  resourceType: CatalogueResourceType,
  occurredAt: string,
  rejectField: RejectField,
): void {
  const data = objectField(value, "data", rejectField);
  if (data.resourceType !== resourceType) {
    rejectField("data.resourceType");
  }
  const resourceId = requiredTextField(data, "resourceId", "data.", rejectField);
  if (timestampField(data, "occurredAt", "data.", rejectField) !== occurredAt) {
    rejectField("data.occurredAt");
  }
  const updatedAt = timestampField(data, "updatedAt", "data.", rejectField);
  const resource = objectField(data.resource, "data.resource", rejectField);
  RESOURCE_ASSERTIONS[resourceType](resource, rejectField);
  if (resource.id !== resourceId) {
    rejectField("data.resourceId");
  }
  if (resource.updatedAt !== updatedAt) {
    rejectField("data.updatedAt");
  }
}

function assertProduct(resource: JsonObject, rejectField: RejectField): void {
  const prefix = "data.resource.";
  requiredTextField(resource, "id", prefix, rejectField);
  requiredTextField(resource, "name", prefix, rejectField);
  nullableTextField(resource, "description", prefix, rejectField);
  nullableTextField(resource, "lookupKey", prefix, rejectField);
  booleanField(resource, "active", prefix, rejectField);
  nullableTextField(resource, "defaultPriceId", prefix, rejectField);
  timestampField(resource, "createdAt", prefix, rejectField);
  timestampField(resource, "updatedAt", prefix, rejectField);
}

function assertPrice(resource: JsonObject, rejectField: RejectField): void {
  const prefix = "data.resource.";
  requiredTextField(resource, "id", prefix, rejectField);
  requiredTextField(resource, "productId", prefix, rejectField);
  integerField(resource, "unitAmount", 0, prefix, rejectField);
  requiredTextField(resource, "currency", prefix, rejectField);
  if (!isKey(PRICE_TYPES, resource.type)) {
    rejectField(`${prefix}type`);
  }
  if (resource.recurring !== null) {
    const recurring = objectField(resource.recurring, `${prefix}recurring`, rejectField);
    if (!isKey(PRICE_INTERVALS, recurring.interval)) {
      rejectField(`${prefix}recurring.interval`);
    }
    integerField(recurring, "intervalCount", 1, `${prefix}recurring.`, rejectField);
  }
  nullableTextField(resource, "description", prefix, rejectField);
  nullableTextField(resource, "lookupKey", prefix, rejectField);
  booleanField(resource, "active", prefix, rejectField);
  timestampField(resource, "createdAt", prefix, rejectField);
  timestampField(resource, "updatedAt", prefix, rejectField);
}
