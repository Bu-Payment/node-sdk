import {
  type CursorScope,
  type DeferredSender,
  deferSender,
  type PageMethods,
  pageMethods,
  pageQuery,
  type RequestScope,
  readRequest,
  type ScopeMethods,
  type Sender,
  scopeMethods,
  writeRequest,
} from "../core/builder";
import type { PageWithMore } from "../core/pagination";
import { encodePathSegment } from "../core/request-target";
import { type NotificationPlanBuilder, notificationPlan } from "./notifications";
import type { MigrationStatus, SubscriptionPriceMigration } from "./types";

const BASE_PATH = "/v1/subscription-price-migrations";

interface MigrationListState extends CursorScope {
  subscriptionId?: string;
  status?: MigrationStatus;
}

export interface MigrationListBuilder
  extends PageMethods<
    MigrationListBuilder,
    SubscriptionPriceMigration,
    PageWithMore<SubscriptionPriceMigration>
  > {
  subscriptionId(subscriptionId: string): MigrationListBuilder;
  status(status: MigrationStatus): MigrationListBuilder;
}

export interface MigrationBuilder extends ScopeMethods<MigrationBuilder> {
  idempotencyKey(idempotencyKey: string): MigrationBuilder;
  get(): Promise<SubscriptionPriceMigration>;
  approve(): Promise<SubscriptionPriceMigration>;
  cancel(): Promise<SubscriptionPriceMigration>;
  retry(): Promise<SubscriptionPriceMigration>;
  settle(): Promise<SubscriptionPriceMigration>;
  notificationPlan(): NotificationPlanBuilder<Record<never, never>>;
}

export interface PriceMigrationsClient {
  list(): MigrationListBuilder;
  migration(migrationId: string): MigrationBuilder;
}

export function createPriceMigrationsClient(dispatch: Sender): PriceMigrationsClient {
  const send = deferSender(dispatch);
  return Object.freeze({
    list: () => migrationList(send, {}),
    migration: (migrationId: string) => migrationBuilder(send, migrationId, {}),
  });
}

function migrationList(send: DeferredSender, state: MigrationListState): MigrationListBuilder {
  const next = (update: Partial<MigrationListState>) =>
    migrationList(send, { ...state, ...update });
  const read = (page: MigrationListState) =>
    send<PageWithMore<SubscriptionPriceMigration>>(() =>
      readRequest(
        BASE_PATH,
        page,
        pageQuery(page, {
          ...(page.subscriptionId === undefined ? {} : { subscriptionId: page.subscriptionId }),
          ...(page.status === undefined ? {} : { status: page.status }),
        }),
      ),
    );
  return Object.freeze({
    ...pageMethods(state, next, read),
    subscriptionId: (subscriptionId: string) => next({ subscriptionId }),
    status: (status: MigrationStatus) => next({ status }),
  });
}

function migrationBuilder(
  send: DeferredSender,
  migrationId: string,
  state: RequestScope & { idempotencyKey?: string },
): MigrationBuilder {
  const path = () => `${BASE_PATH}/${encodePathSegment(migrationId)}`;
  const next = (update: Partial<RequestScope & { idempotencyKey?: string }>) =>
    migrationBuilder(send, migrationId, { ...state, ...update });
  const mutate = (operation: string) =>
    send<SubscriptionPriceMigration>(() => writeRequest("POST", `${path()}/${operation}`, state));
  return Object.freeze({
    ...scopeMethods(next),
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
    get: () => send<SubscriptionPriceMigration>(() => readRequest(path(), state)),
    approve: () => mutate("approve"),
    cancel: () => mutate("cancel"),
    retry: () => mutate("retry"),
    settle: () => mutate("settle"),
    notificationPlan: () => notificationPlan(send, path, state),
  });
}
