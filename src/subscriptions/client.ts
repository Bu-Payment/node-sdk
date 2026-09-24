import {
  type CursorScope,
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
import { type SubscriptionDraft, subscriptionDraft } from "./draft";
import {
  type CancellationBuilder,
  cancellation,
  type PauseCollectionBuilder,
  type PauseSubscriptionBuilder,
  type PlainResumeBuilder,
  pauseCollection,
  pauseSubscription,
  plainResume,
  type ResumePausedBuilder,
  resumePaused,
} from "./lifecycle";
import { type MigrationDraft, migrationDraft } from "./migration-draft";
import type { Subscription, SubscriptionDetail, SubscriptionStatus } from "./types";

interface SubscriptionListState extends CursorScope {
  customerId?: string;
  status?: SubscriptionStatus;
  priceId?: string;
  productId?: string;
  name?: string;
  includeBindings?: boolean;
}

export interface SubscriptionListBuilder
  extends PageMethods<SubscriptionListBuilder, Subscription> {
  customerId(customerId: string): SubscriptionListBuilder;
  status(status: SubscriptionStatus): SubscriptionListBuilder;
  priceId(priceId: string): SubscriptionListBuilder;
  productId(productId: string): SubscriptionListBuilder;
  name(name: string): SubscriptionListBuilder;
  includeBindings(includeBindings: boolean): SubscriptionListBuilder;
  get(): Promise<PageWithMore<Subscription>>;
}

export interface SubscriptionBuilder extends ScopeMethods<SubscriptionBuilder> {
  idempotencyKey(idempotencyKey: string): SubscriptionBuilder;
  get(): Promise<SubscriptionDetail>;
  cancellation(): CancellationBuilder<Record<never, never>>;
  pauseSubscription(): PauseSubscriptionBuilder<Record<never, never>>;
  pausePaymentCollection(): PauseCollectionBuilder<Record<never, never>>;
  resumePendingCancellation(): PlainResumeBuilder;
  resumePausedSubscription(): ResumePausedBuilder<Record<never, never>>;
  resumePaymentCollection(): PlainResumeBuilder;
  cancelScheduledChange(): Promise<SubscriptionDetail>;
  priceMigration(): MigrationDraft<Record<never, never>>;
}

export interface SubscriptionsClient {
  list(): SubscriptionListBuilder;
  subscription(subscriptionId: string): SubscriptionBuilder;
  create(): SubscriptionDraft<Record<never, never>>;
}

export function createSubscriptionsClient(send: Sender): SubscriptionsClient {
  return Object.freeze({
    list: () => subscriptionList(send, {}),
    subscription: (subscriptionId: string) => subscriptionBuilder(send, subscriptionId, {}),
    create: () => subscriptionDraft(send, {}),
  });
}

function subscriptionList(send: Sender, state: SubscriptionListState): SubscriptionListBuilder {
  const next = (update: Partial<SubscriptionListState>) =>
    subscriptionList(send, { ...state, ...update });
  const read = (page: SubscriptionListState) =>
    send<PageWithMore<Subscription>>(
      readRequest(
        "/v1/subscriptions",
        page,
        pageQuery(page, {
          ...(page.customerId === undefined ? {} : { customerId: page.customerId }),
          ...(page.status === undefined ? {} : { status: page.status }),
          ...(page.priceId === undefined ? {} : { priceId: page.priceId }),
          ...(page.productId === undefined ? {} : { productId: page.productId }),
          ...(page.name === undefined ? {} : { name: page.name }),
          ...(page.includeBindings === undefined ? {} : { includeBindings: page.includeBindings }),
        }),
      ),
    );
  return Object.freeze({
    ...pageMethods(state, next, read),
    customerId: (customerId: string) => next({ customerId }),
    status: (status: SubscriptionStatus) => next({ status }),
    priceId: (priceId: string) => next({ priceId }),
    productId: (productId: string) => next({ productId }),
    name: (name: string) => next({ name }),
    includeBindings: (includeBindings: boolean) => next({ includeBindings }),
  }) as SubscriptionListBuilder;
}

function subscriptionBuilder(
  send: Sender,
  subscriptionId: string,
  state: RequestScope & { idempotencyKey?: string },
): SubscriptionBuilder {
  const path = `/v1/subscriptions/${encodePathSegment(subscriptionId)}`;
  const next = (update: Partial<RequestScope & { idempotencyKey?: string }>) =>
    subscriptionBuilder(send, subscriptionId, { ...state, ...update });
  return Object.freeze({
    ...scopeMethods(next),
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
    get: () => send<SubscriptionDetail>(readRequest(path, state)),
    cancellation: () => cancellation(send, path, state),
    pauseSubscription: () => pauseSubscription(send, path, state),
    pausePaymentCollection: () => pauseCollection(send, path, state),
    resumePendingCancellation: () => plainResume(send, path, "pending_cancellation", state),
    resumePausedSubscription: () => resumePaused(send, path, state),
    resumePaymentCollection: () => plainResume(send, path, "payment_collection", state),
    cancelScheduledChange: () =>
      send<SubscriptionDetail>(writeRequest("POST", `${path}/scheduled-change/cancel`, state)),
    priceMigration: () => migrationDraft(send, path, state),
  });
}
