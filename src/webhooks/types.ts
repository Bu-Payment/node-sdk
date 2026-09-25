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

export type WebhookHeaders = Headers | Readonly<Record<string, string | string[] | undefined>>;

export interface WebhookDeliveryInput {
  body: string | Uint8Array;
  headers: WebhookHeaders;
  secret: string;
  toleranceSeconds?: number;
  now?: () => number;
}

export interface VerifiedWebhookDelivery {
  deliveryId: string;
  timestamp: Date;
  payload: Record<string, unknown>;
}
