import { type ClientConfig, type ClientConfigInput, parseClientConfig } from "./core/config";
import { SignedTransport, type TransportOptions, type TransportRequest } from "./core/http";
import { generateIdempotencyKey, parseIdempotencyKey } from "./core/idempotency";
import { CouponsResource } from "./resources/coupons";
import { CustomersResource } from "./resources/customers";
import { EventsResource } from "./resources/events";
import { InvoicesResource } from "./resources/invoices";
import { PaymentsResource } from "./resources/payments";
import { PricesResource } from "./resources/prices";
import { ProductsResource } from "./resources/products";
import { RefundsResource } from "./resources/refunds";
import type { RequestSender } from "./resources/resource";
import { ShippingRatesResource } from "./resources/shipping-rates";
import { SubscriptionCheckoutsResource } from "./resources/subscription-checkouts";
import { SubscriptionPriceMigrationsResource } from "./resources/subscription-price-migrations";
import { SubscriptionsResource } from "./resources/subscriptions";
import { TaxRatesResource } from "./resources/tax-rates";
import { WebhookDeliveriesResource, WebhookEndpointsResource } from "./resources/webhooks";

export type ClientOptions = TransportOptions;

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export class BuPaymentClient {
  readonly #config: ClientConfig;
  readonly #transport: SignedTransport;

  readonly products: ProductsResource;
  readonly prices: PricesResource;
  readonly customers: CustomersResource;
  readonly coupons: CouponsResource;
  readonly taxRates: TaxRatesResource;
  readonly shippingRates: ShippingRatesResource;
  readonly subscriptionCheckouts: SubscriptionCheckoutsResource;
  readonly payments: PaymentsResource;
  readonly subscriptions: SubscriptionsResource;
  readonly subscriptionPriceMigrations: SubscriptionPriceMigrationsResource;
  readonly invoices: InvoicesResource;
  readonly refunds: RefundsResource;
  readonly events: EventsResource;
  readonly webhookEndpoints: WebhookEndpointsResource;
  readonly webhookDeliveries: WebhookDeliveriesResource;

  constructor(input: ClientConfigInput, options: ClientOptions = {}) {
    this.#config = parseClientConfig(input);
    this.#transport = new SignedTransport(this.#config, options);
    const send: RequestSender = (request) => this.request(request);
    this.products = new ProductsResource(send);
    this.prices = new PricesResource(send);
    this.customers = new CustomersResource(send);
    this.coupons = new CouponsResource(send);
    this.taxRates = new TaxRatesResource(send);
    this.shippingRates = new ShippingRatesResource(send);
    this.subscriptionCheckouts = new SubscriptionCheckoutsResource(send);
    this.payments = new PaymentsResource(send);
    this.subscriptions = new SubscriptionsResource(send);
    this.subscriptionPriceMigrations = new SubscriptionPriceMigrationsResource(send);
    this.invoices = new InvoicesResource(send);
    this.refunds = new RefundsResource(send);
    this.events = new EventsResource(send);
    this.webhookEndpoints = new WebhookEndpointsResource(send);
    this.webhookDeliveries = new WebhookDeliveriesResource(send);
  }

  get applicationId(): string {
    return this.#config.applicationId;
  }

  get environment(): ClientConfig["environment"] {
    return this.#config.environment;
  }

  async request<T>(request: TransportRequest): Promise<T> {
    return await this.#transport.send<T>(withIdempotencyKey(request));
  }
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
