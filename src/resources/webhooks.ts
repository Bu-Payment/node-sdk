import type {
  CreatedWebhookEndpoint,
  CreateWebhookEndpointBody,
  DeletedWebhookEndpoint,
  ListWebhookDeliveriesQuery,
  UpdateWebhookEndpointBody,
  WebhookDelivery,
  WebhookDeliveryRetry,
  WebhookEndpoint,
} from "../models/webhooks";
import { Resource } from "./resource";

export class WebhookEndpointsResource extends Resource {
  create(
    body: CreateWebhookEndpointBody,
    idempotencyKey?: string,
  ): Promise<CreatedWebhookEndpoint> {
    return this.send({
      method: "POST",
      path: "/v1/webhook-endpoints",
      body,
      ...this.replay(idempotencyKey),
    });
  }

  list(): Promise<WebhookEndpoint[]> {
    return this.send({ method: "GET", path: "/v1/webhook-endpoints" });
  }

  get(endpointId: string): Promise<WebhookEndpoint> {
    return this.send({
      method: "GET",
      path: `/v1/webhook-endpoints/${this.segment(endpointId)}`,
    });
  }

  update(
    endpointId: string,
    body: UpdateWebhookEndpointBody,
    idempotencyKey?: string,
  ): Promise<WebhookEndpoint> {
    return this.send({
      method: "PATCH",
      path: `/v1/webhook-endpoints/${this.segment(endpointId)}`,
      body,
      ...this.replay(idempotencyKey),
    });
  }

  remove(endpointId: string, idempotencyKey?: string): Promise<DeletedWebhookEndpoint> {
    return this.send({
      method: "DELETE",
      path: `/v1/webhook-endpoints/${this.segment(endpointId)}`,
      ...this.replay(idempotencyKey),
    });
  }
}

export class WebhookDeliveriesResource extends Resource {
  list(query: ListWebhookDeliveriesQuery = {}): Promise<WebhookDelivery[]> {
    return this.send({ method: "GET", path: "/v1/webhook-deliveries", query });
  }

  get(deliveryId: string): Promise<WebhookDelivery> {
    return this.send({
      method: "GET",
      path: `/v1/webhook-deliveries/${this.segment(deliveryId)}`,
    });
  }

  retry(deliveryId: string, idempotencyKey?: string): Promise<WebhookDeliveryRetry> {
    return this.send({
      method: "POST",
      path: `/v1/webhook-deliveries/${this.segment(deliveryId)}/retry`,
      ...this.replay(idempotencyKey),
    });
  }
}
