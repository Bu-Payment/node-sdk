import { type BillingClient, createBillingClient } from "./billing/client";
import { type CatalogueClient, createCatalogueClient } from "./catalogue/client";
import { type CheckoutClient, createCheckoutClient } from "./checkout/client";
import type { Sender } from "./core/builder";
import { type ClientConfigInput, parseClientConfig } from "./core/config";
import { SignedTransport, type TransportOptions, type TransportRequest } from "./core/http";
import { generateIdempotencyKey, parseIdempotencyKey } from "./core/idempotency";
import { type CustomersClient, createCustomersClient } from "./customers/client";
import { createEventsClient, type EventsClient } from "./events/client";
import { createInvoicesClient, type InvoicesClient } from "./invoices/client";
import { createPaymentMethodsClient, type PaymentMethodsClient } from "./payment-methods/client";
import { createPaymentsClient, type PaymentsClient } from "./payments/client";
import { createPriceMigrationsClient, type PriceMigrationsClient } from "./price-migrations/client";
import { createRefundsClient, type RefundsClient } from "./refunds/client";
import { createSubscriptionsClient, type SubscriptionsClient } from "./subscriptions/client";
import { createWebhooksClient, type WebhooksClient } from "./webhooks/client";

export type ClientOptions = TransportOptions;

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface BuPaymentClient {
  readonly applicationId: string;
  readonly environment: "test" | "live";
  readonly catalogue: CatalogueClient;
  readonly customers: CustomersClient;
  readonly checkout: CheckoutClient;
  readonly payments: PaymentsClient;
  readonly paymentMethods: PaymentMethodsClient;
  readonly billing: BillingClient;
  readonly invoices: InvoicesClient;
  readonly refunds: RefundsClient;
  readonly subscriptions: SubscriptionsClient;
  readonly priceMigrations: PriceMigrationsClient;
  readonly events: EventsClient;
  readonly webhooks: WebhooksClient;
  request<T>(request: TransportRequest): Promise<T>;
}

export function createBuPaymentClient(
  input: ClientConfigInput,
  options: ClientOptions = {},
): BuPaymentClient {
  const config = parseClientConfig(input);
  const transport = new SignedTransport(config, options);
  const send: Sender = async (request) => await transport.send(withIdempotencyKey(request));
  return Object.freeze({
    applicationId: config.applicationId,
    environment: config.environment,
    catalogue: createCatalogueClient(send),
    customers: createCustomersClient(send),
    checkout: createCheckoutClient(send),
    payments: createPaymentsClient(send),
    paymentMethods: createPaymentMethodsClient(send),
    billing: createBillingClient(send),
    invoices: createInvoicesClient(send),
    refunds: createRefundsClient(send),
    subscriptions: createSubscriptionsClient(send),
    priceMigrations: createPriceMigrationsClient(send),
    events: createEventsClient(send),
    webhooks: createWebhooksClient(send),
    request: <T>(request: TransportRequest) => send<T>(request),
  });
}

function withIdempotencyKey(request: TransportRequest): TransportRequest {
  if (request.idempotencyKey !== undefined) {
    return { ...request, idempotencyKey: parseIdempotencyKey(request.idempotencyKey) };
  }
  if (!MUTATING_METHODS.has(request.method.toUpperCase())) {
    return request;
  }
  return { ...request, idempotencyKey: generateIdempotencyKey() };
}
