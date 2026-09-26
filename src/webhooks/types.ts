import type { Price, Product } from "../catalogue/types";

export type WebhookEndpointStatus = "enabled" | "disabled";

export interface WebhookEndpoint {
  id: string;
  environmentId: string;
  url: string;
  description: string | null;
  enabledEvents: string[];
  status: WebhookEndpointStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreatedWebhookEndpoint extends WebhookEndpoint {
  secret: string;
}

export interface DeletedWebhookEndpoint {
  id: string;
  deleted: true;
}

export type WebhookDeliveryStatus = "pending" | "delivering" | "succeeded" | "failed" | "exhausted";

export interface WebhookDelivery {
  id: string;
  environmentId: string;
  webhookEndpointId: string;
  platformEventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: WebhookDeliveryStatus;
  attempts: number;
  maxAttempts: number;
  responseCode: number | null;
  responseBody: string | null;
  nextRetryAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDeliveryRetry {
  id: string;
  status: WebhookDeliveryStatus;
}

export interface WebhookHeaderReader {
  get(name: string): string | null;
}

export type WebhookHeaders =
  | WebhookHeaderReader
  | Readonly<Record<string, string | string[] | undefined>>;

export interface WebhookDeliveryInput {
  body: string | Uint8Array;
  headers: WebhookHeaders;
  secret: string;
  toleranceSeconds?: number;
  now?: () => number;
}

export interface VerifiedWebhookDelivery {
  deliveryId: string;
  signature: string;
  timestamp: Date;
  event: WebhookEvent;
}

export type CatalogueProductEventType =
  | "catalogue.product.created.v1"
  | "catalogue.product.updated.v1"
  | "catalogue.product.archived.v1"
  | "catalogue.product.reactivated.v1"
  | "catalogue.product.default_price.updated.v1"
  | "catalogue.product.assigned.v1"
  | "catalogue.product.unassigned.v1";

export type CataloguePriceEventType =
  | "catalogue.price.created.v1"
  | "catalogue.price.updated.v1"
  | "catalogue.price.archived.v1"
  | "catalogue.price.reactivated.v1"
  | "catalogue.price.assigned.v1"
  | "catalogue.price.unassigned.v1";

export type CatalogueEventType = CatalogueProductEventType | CataloguePriceEventType;

export interface CatalogueEventProduct extends Product {
  defaultPriceId: string | null;
}

export interface CatalogueEventData<TResourceType extends string, TResource> {
  resourceType: TResourceType;
  resourceId: string;
  occurredAt: string;
  updatedAt: string;
  resource: TResource;
}

export type CatalogueProductEventData = CatalogueEventData<"product", CatalogueEventProduct>;

export type CataloguePriceEventData = CatalogueEventData<"price", Price>;

export interface WebhookEventEnvelope<TType extends string, TData> {
  version: 1;
  id: string;
  type: TType;
  occurredAt: string;
  data: TData;
}

export type CatalogueProductEvent = {
  [TType in CatalogueProductEventType]: WebhookEventEnvelope<TType, CatalogueProductEventData>;
}[CatalogueProductEventType];

export type CataloguePriceEvent = {
  [TType in CataloguePriceEventType]: WebhookEventEnvelope<TType, CataloguePriceEventData>;
}[CataloguePriceEventType];

export type CatalogueEvent = CatalogueProductEvent | CataloguePriceEvent;

export interface UnknownWebhookEvent extends WebhookEventEnvelope<"unknown", unknown> {
  receivedType: string;
}

export type WebhookEvent = CatalogueEvent | UnknownWebhookEvent;
