import type { Price, PriceInterval } from "../catalogue/types";
import { ErrorCode } from "../constants";
import { BuPaymentError } from "../errors";
import type {
  CatalogueEvent,
  CataloguePriceEventType,
  CatalogueProductEventType,
  WebhookEvent,
} from "./types";

type JsonObject = Record<string, unknown>;
type RejectField = (field: string) => never;
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
  if (!isKey(CATALOGUE_EVENT_RESOURCES, type)) {
    return { version: 1, id, type: "unknown", receivedType: type, occurredAt, data: payload.data };
  }
  assertCatalogueData(payload.data, CATALOGUE_EVENT_RESOURCES[type], occurredAt, rejectField);
  return { version: 1, id, type, occurredAt, data: payload.data } as CatalogueEvent;
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

function isKey<TKey extends string>(
  map: Readonly<Record<TKey, unknown>>,
  key: unknown,
): key is TKey {
  return typeof key === "string" && Object.hasOwn(map, key);
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

function objectField(value: unknown, field: string, rejectField: RejectField): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return rejectField(field);
  }
  return value as JsonObject;
}

function requiredTextField(
  source: JsonObject,
  key: string,
  prefix: string,
  rejectField: RejectField,
): string {
  const value = source[key];
  if (typeof value !== "string" || value === "") {
    return rejectField(`${prefix}${key}`);
  }
  return value;
}

function nullableTextField(
  source: JsonObject,
  key: string,
  prefix: string,
  rejectField: RejectField,
): void {
  if (source[key] !== null && typeof source[key] !== "string") {
    rejectField(`${prefix}${key}`);
  }
}

function booleanField(
  source: JsonObject,
  key: string,
  prefix: string,
  rejectField: RejectField,
): void {
  if (typeof source[key] !== "boolean") {
    rejectField(`${prefix}${key}`);
  }
}

function integerField(
  source: JsonObject,
  key: string,
  minimum: number,
  prefix: string,
  rejectField: RejectField,
): void {
  const value = source[key];
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    rejectField(`${prefix}${key}`);
  }
}

function timestampField(
  source: JsonObject,
  key: string,
  prefix: string,
  rejectField: RejectField,
): string {
  const value = requiredTextField(source, key, prefix, rejectField);
  const time = Date.parse(value);
  if (Number.isNaN(time) || new Date(time).toISOString() !== value) {
    rejectField(`${prefix}${key}`);
  }
  return value;
}

function fieldRejecter(payload: JsonObject): RejectField {
  const context = {
    ...(typeof payload.id === "string" ? { eventId: payload.id } : {}),
    ...(typeof payload.type === "string" ? { eventType: payload.type } : {}),
  };
  return (field: string) => {
    throw new BuPaymentError(`Webhook event field ${field} does not match its documented shape`, {
      code: ErrorCode.WEBHOOK_EVENT_INVALID,
      metadata: { ...context, field },
    });
  };
}
