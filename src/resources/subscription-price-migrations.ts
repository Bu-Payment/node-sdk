import { type PageWithMore, paginate } from "../core/pagination";
import type {
  ListSubscriptionPriceMigrationsQuery,
  MigrationNotificationPlan,
  RescheduleMigrationNotificationBody,
  SubscriptionPriceMigration,
} from "../models/subscription-price-migrations";
import { Resource } from "./resource";

const BASE_PATH = "/v1/subscription-price-migrations";

export class SubscriptionPriceMigrationsResource extends Resource {
  list(
    query: ListSubscriptionPriceMigrationsQuery = {},
  ): Promise<PageWithMore<SubscriptionPriceMigration>> {
    return this.send({ method: "GET", path: BASE_PATH, query });
  }

  listAll(
    query: ListSubscriptionPriceMigrationsQuery = {},
  ): AsyncGenerator<SubscriptionPriceMigration, void, undefined> {
    return paginate((page: ListSubscriptionPriceMigrationsQuery) => this.list(page), query);
  }

  get(migrationId: string): Promise<SubscriptionPriceMigration> {
    return this.send({ method: "GET", path: `${BASE_PATH}/${this.segment(migrationId)}` });
  }

  approve(migrationId: string, idempotencyKey?: string): Promise<SubscriptionPriceMigration> {
    return this.mutate(migrationId, "approve", idempotencyKey);
  }

  cancel(migrationId: string, idempotencyKey?: string): Promise<SubscriptionPriceMigration> {
    return this.mutate(migrationId, "cancel", idempotencyKey);
  }

  retry(migrationId: string, idempotencyKey?: string): Promise<SubscriptionPriceMigration> {
    return this.mutate(migrationId, "retry", idempotencyKey);
  }

  settle(migrationId: string, idempotencyKey?: string): Promise<SubscriptionPriceMigration> {
    return this.mutate(migrationId, "settle", idempotencyKey);
  }

  notificationPlan(migrationId: string): Promise<MigrationNotificationPlan> {
    return this.send({
      method: "GET",
      path: `${BASE_PATH}/${this.segment(migrationId)}/notification-plan`,
    });
  }

  retryNotification(
    migrationId: string,
    planVersion: number,
    channel: string,
    idempotencyKey?: string,
  ): Promise<MigrationNotificationPlan> {
    return this.send({
      method: "POST",
      path: `${BASE_PATH}/${this.segment(migrationId)}/notification-plans/${this.segment(
        String(planVersion),
      )}/channels/${this.segment(channel)}/retry`,
      ...this.replay(idempotencyKey),
    });
  }

  rescheduleNotification(
    migrationId: string,
    planVersion: number,
    body: RescheduleMigrationNotificationBody,
    idempotencyKey?: string,
  ): Promise<MigrationNotificationPlan> {
    return this.send({
      method: "POST",
      path: `${BASE_PATH}/${this.segment(migrationId)}/notification-plans/${this.segment(
        String(planVersion),
      )}/reschedule`,
      body,
      ...this.replay(idempotencyKey),
    });
  }

  private mutate(
    migrationId: string,
    operation: string,
    idempotencyKey: string | undefined,
  ): Promise<SubscriptionPriceMigration> {
    return this.send({
      method: "POST",
      path: `${BASE_PATH}/${this.segment(migrationId)}/${operation}`,
      ...this.replay(idempotencyKey),
    });
  }
}
