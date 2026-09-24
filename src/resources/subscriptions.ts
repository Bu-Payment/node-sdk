import { type PageWithMore, paginate } from "../core/pagination";
import type {
  CreateSubscriptionPriceMigrationBody,
  SubscriptionPriceMigration,
} from "../models/subscription-price-migrations";
import type {
  CancelSubscriptionBody,
  CreateSubscriptionBody,
  ListSubscriptionsQuery,
  PauseSubscriptionBody,
  ResumeSubscriptionBody,
  Subscription,
  SubscriptionDetail,
} from "../models/subscriptions";
import { Resource } from "./resource";

export class SubscriptionsResource extends Resource {
  create(body: CreateSubscriptionBody, idempotencyKey?: string): Promise<SubscriptionDetail> {
    return this.send({
      method: "POST",
      path: "/v1/subscriptions",
      body,
      ...this.replay(idempotencyKey),
    });
  }

  list(query: ListSubscriptionsQuery = {}): Promise<PageWithMore<Subscription>> {
    return this.send({ method: "GET", path: "/v1/subscriptions", query });
  }

  listAll(query: ListSubscriptionsQuery = {}): AsyncGenerator<Subscription, void, undefined> {
    return paginate((page: ListSubscriptionsQuery) => this.list(page), query);
  }

  get(subscriptionId: string): Promise<SubscriptionDetail> {
    return this.send({
      method: "GET",
      path: `/v1/subscriptions/${this.segment(subscriptionId)}`,
    });
  }

  cancel(
    subscriptionId: string,
    body: CancelSubscriptionBody,
    idempotencyKey?: string,
  ): Promise<SubscriptionDetail> {
    return this.lifecycle(subscriptionId, "cancel", body, idempotencyKey);
  }

  pause(
    subscriptionId: string,
    body: PauseSubscriptionBody,
    idempotencyKey?: string,
  ): Promise<SubscriptionDetail> {
    return this.lifecycle(subscriptionId, "pause", body, idempotencyKey);
  }

  resume(
    subscriptionId: string,
    body: ResumeSubscriptionBody,
    idempotencyKey?: string,
  ): Promise<SubscriptionDetail> {
    return this.lifecycle(subscriptionId, "resume", body, idempotencyKey);
  }

  cancelScheduledChange(
    subscriptionId: string,
    idempotencyKey?: string,
  ): Promise<SubscriptionDetail> {
    return this.send({
      method: "POST",
      path: `/v1/subscriptions/${this.segment(subscriptionId)}/scheduled-change/cancel`,
      ...this.replay(idempotencyKey),
    });
  }

  createPriceMigration(
    subscriptionId: string,
    body: CreateSubscriptionPriceMigrationBody,
    idempotencyKey?: string,
  ): Promise<SubscriptionPriceMigration> {
    return this.send({
      method: "POST",
      path: `/v1/subscriptions/${this.segment(subscriptionId)}/price-migrations`,
      body,
      ...this.replay(idempotencyKey),
    });
  }

  private lifecycle(
    subscriptionId: string,
    operation: string,
    body: unknown,
    idempotencyKey: string | undefined,
  ): Promise<SubscriptionDetail> {
    return this.send({
      method: "POST",
      path: `/v1/subscriptions/${this.segment(subscriptionId)}/${operation}`,
      body,
      ...this.replay(idempotencyKey),
    });
  }
}
