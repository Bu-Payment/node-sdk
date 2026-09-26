import type { DeferredSender, RequestScope, ScopeMethods } from "../core/builder";
import { scopeMethods, writeRequest } from "../core/builder";
import type { SubscriptionDetail } from "./types";

type Activation =
  | { state: "pending" }
  | { state: "active"; startsAt: string }
  | { state: "trialing"; startsAt: string; trialEndsAt: string };

export interface DraftState extends RequestScope {
  trialStartsAt?: string;
  customerId?: string;
  name?: string;
  priceId?: string;
  quantity?: number;
  activation?: Activation;
  idempotencyKey?: string;
}

interface DraftMethods<TState extends DraftState> extends ScopeMethods<SubscriptionDraft<TState>> {
  customerId(customerId: string): SubscriptionDraft<TState & { customerId: string }>;
  name(name: string): SubscriptionDraft<TState & { name: string }>;
  priceId(priceId: string): SubscriptionDraft<TState & { priceId: string }>;
  quantity(quantity: number): SubscriptionDraft<TState>;
  pending(): SubscriptionDraft<TState & { activation: Activation }>;
  activeFrom(startsAt: string): SubscriptionDraft<TState & { activation: Activation }>;
  trialingFrom(startsAt: string): SubscriptionDraft<TState & { trialStartsAt: string }>;
  idempotencyKey(idempotencyKey: string): SubscriptionDraft<TState>;
}

interface TrialEndable<TState extends DraftState> {
  trialEndsAt(trialEndsAt: string): SubscriptionDraft<TState & { activation: Activation }>;
}

export interface CreatableSubscription {
  create(): Promise<SubscriptionDetail>;
}

type DraftReady = {
  customerId: string;
  name: string;
  priceId: string;
  activation: Activation;
};

export type SubscriptionDraft<TState extends DraftState = DraftState> = DraftMethods<TState> &
  (TState extends { trialStartsAt: string } ? TrialEndable<TState> : object) &
  (TState extends DraftReady ? CreatableSubscription : object);

export function subscriptionDraft<TState extends DraftState>(
  send: DeferredSender,
  state: TState,
): SubscriptionDraft<TState> {
  const next = (update: Partial<DraftState>) => subscriptionDraft(send, { ...state, ...update });
  const builder: Record<string, unknown> = {
    ...scopeMethods(next),
    customerId: (customerId: string) => next({ customerId }),
    name: (name: string) => next({ name }),
    priceId: (priceId: string) => next({ priceId }),
    quantity: (quantity: number) => next({ quantity }),
    pending: () => next({ activation: { state: "pending" } }),
    activeFrom: (startsAt: string) => next({ activation: { state: "active", startsAt } }),
    trialingFrom: (startsAt: string) => next({ trialStartsAt: startsAt }),
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
  };
  const trialStartsAt = state.trialStartsAt;
  if (trialStartsAt !== undefined) {
    builder.trialEndsAt = (trialEndsAt: string) =>
      next({ activation: { state: "trialing", startsAt: trialStartsAt, trialEndsAt } });
  }
  if (isReady(state)) {
    builder.create = () =>
      send<SubscriptionDetail>(() =>
        writeRequest("POST", "/v1/subscriptions", state, {
          customerId: state.customerId,
          name: state.name,
          priceId: state.priceId,
          ...(state.quantity === undefined ? {} : { quantity: state.quantity }),
          activation: state.activation,
        }),
      );
  }
  return Object.freeze(builder) as SubscriptionDraft<TState>;
}

function isReady(state: DraftState): boolean {
  return (
    state.customerId !== undefined &&
    state.name !== undefined &&
    state.priceId !== undefined &&
    state.activation !== undefined
  );
}
