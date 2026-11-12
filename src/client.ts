import { type BillingClient, createBillingClient } from "./billing/client";
import { type CatalogueClient, createCatalogueClient } from "./catalogue/client";
import { type CheckoutClient, seededCheckoutClient } from "./checkout/client";
import type { CheckoutSessionState } from "./checkout/one-time";
import { EnvVariable } from "./constants";
import type { Sender } from "./core/builder";
import { type ClientConfigInput, parseClientConfig, parseClientDefaults } from "./core/config";
import { type BuPaymentEnv, clientConfigFromEnv, configurationMissing } from "./core/env";
import { SignedTransport, type TransportOptions, type TransportRequest } from "./core/http";
import { generateIdempotencyKey, parseIdempotencyKey } from "./core/idempotency";
import { type CustomersClient, createCustomersClient } from "./customers/client";
import { createEventsClient, type EventsClient } from "./events/client";
import { createInvoicesClient, type InvoicesClient } from "./invoices/client";
import { createPaymentMethodsClient, type PaymentMethodsClient } from "./payment-methods/client";
import { createPaymentsClient, type PaymentsClient } from "./payments/client";
import { createPriceMigrationsClient, type PriceMigrationsClient } from "./price-migrations/client";
import { createRefundsClient, type RefundsClient } from "./refunds/client";
import { createSalesClient, type SalesClient } from "./sales/client";
import { createSubscriptionsClient, type SubscriptionsClient } from "./subscriptions/client";
import { createWebhooksClient, type WebhooksClient } from "./webhooks/client";

export type ClientOptions = TransportOptions;

export interface DefaultDestination {
  destination: string;
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface BuPaymentClient<TSession extends CheckoutSessionState = Record<never, never>> {
  readonly applicationId: string;
  readonly environment: "test" | "live";
  readonly webhookSecret: string;
  readonly catalogue: CatalogueClient;
  readonly customers: CustomersClient;
  readonly checkout: CheckoutClient<TSession>;
  readonly payments: PaymentsClient;
  readonly sales: SalesClient;
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
  input: ClientConfigInput & { destinationKey: string },
  options?: ClientOptions,
): BuPaymentClient<DefaultDestination>;
export function createBuPaymentClient(
  input: ClientConfigInput,
  options?: ClientOptions,
): BuPaymentClient;
export function createBuPaymentClient(
  input: ClientConfigInput,
  options: ClientOptions = {},
): BuPaymentClient<CheckoutSessionState> {
  return buildClient(input, options, {});
}

export function createBuPaymentClientFromEnv(
  env: BuPaymentEnv = process.env,
  options: ClientOptions = {},
): BuPaymentClient<DefaultDestination> {
  const input = clientConfigFromEnv(env);
  const session: CheckoutSessionState =
    input.destinationKey === undefined ? { unconfiguredDestination: true } : {};
  return buildClient(input, options, session) as BuPaymentClient<DefaultDestination>;
}

function buildClient(
  input: ClientConfigInput,
  options: ClientOptions,
  session: CheckoutSessionState,
): BuPaymentClient<CheckoutSessionState> {
  const config = parseClientConfig(input);
  const { destinationKey, webhookSecret } = parseClientDefaults(input);
  const transport = new SignedTransport(config, options);
  const send: Sender = async (request) => await transport.send(withIdempotencyKey(request));
  const customers = createCustomersClient(send);
  const payments = createPaymentsClient(send);
  const client = {
    applicationId: config.applicationId,
    environment: config.environment,
    catalogue: createCatalogueClient(send),
    customers,
    checkout: seededCheckoutClient<CheckoutSessionState>(send, {
      ...(destinationKey === undefined ? {} : { destination: destinationKey }),
      ...session,
    }),
    payments,
    sales: createSalesClient(customers, payments),
    paymentMethods: createPaymentMethodsClient(send),
    billing: createBillingClient(send),
    invoices: createInvoicesClient(send),
    refunds: createRefundsClient(send),
    subscriptions: createSubscriptionsClient(send),
    priceMigrations: createPriceMigrationsClient(send),
    events: createEventsClient(send),
    webhooks: createWebhooksClient(send),
    request: <T>(request: TransportRequest) => send<T>(request),
  };
  Object.defineProperty(client, "webhookSecret", {
    enumerable: false,
    get: () => webhookSecret ?? missingWebhookSecret(),
  });
  return Object.freeze(client) as BuPaymentClient<CheckoutSessionState>;
}

function missingWebhookSecret(): never {
  throw configurationMissing(
    "Webhook secret is not configured: pass webhookSecret or set BU_PAYMENT_WEBHOOK_SECRET",
    [EnvVariable.WEBHOOK_SECRET],
  );
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
