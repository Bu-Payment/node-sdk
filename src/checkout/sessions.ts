import type { DeferredSender, RequestScope, ScopeMethods } from "../core/builder";
import { scopeMethods, writeRequest } from "../core/builder";
import type { CheckoutSession } from "./types";

export interface SessionState extends RequestScope {
  name?: string;
  priceId?: string;
  customerId?: string;
  customerEmail?: string;
  customerName?: string;
  trialDays?: number;
  successUrl?: string;
  cancelUrl?: string;
  idempotencyKey?: string;
}

interface SessionMethods<TState extends SessionState>
  extends ScopeMethods<SubscriptionSessionBuilder<TState>> {
  name(name: string): SubscriptionSessionBuilder<TState & { name: string }>;
  priceId(priceId: string): SubscriptionSessionBuilder<TState & { priceId: string }>;
  customerId(customerId: string): SubscriptionSessionBuilder<TState & { customerId: string }>;
  customerEmail(
    customerEmail: string,
  ): SubscriptionSessionBuilder<TState & { customerEmail: string }>;
  customerName(customerName: string): SubscriptionSessionBuilder<TState>;
  trialDays(trialDays: number): SubscriptionSessionBuilder<TState>;
  successUrl(successUrl: string): SubscriptionSessionBuilder<TState & { successUrl: string }>;
  cancelUrl(cancelUrl: string): SubscriptionSessionBuilder<TState & { cancelUrl: string }>;
  idempotencyKey(idempotencyKey: string): SubscriptionSessionBuilder<TState>;
}

export interface CreatableSession {
  create(): Promise<CheckoutSession>;
}

type SessionReady = {
  name: string;
  priceId: string;
  customerId: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
};

export type SubscriptionSessionBuilder<TState extends SessionState = SessionState> =
  SessionMethods<TState> & (TState extends SessionReady ? CreatableSession : object);

export function subscriptionSession<TState extends SessionState>(
  send: DeferredSender,
  state: TState,
): SubscriptionSessionBuilder<TState> {
  const next = (update: Partial<SessionState>) =>
    subscriptionSession(send, { ...state, ...update });
  const builder: Record<string, unknown> = {
    ...scopeMethods(next),
    name: (name: string) => next({ name }),
    priceId: (priceId: string) => next({ priceId }),
    customerId: (customerId: string) => next({ customerId }),
    customerEmail: (customerEmail: string) => next({ customerEmail }),
    customerName: (customerName: string) => next({ customerName }),
    trialDays: (trialDays: number) => next({ trialDays }),
    successUrl: (successUrl: string) => next({ successUrl }),
    cancelUrl: (cancelUrl: string) => next({ cancelUrl }),
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
  };
  if (isReady(state)) {
    builder.create = () =>
      send<CheckoutSession>(() =>
        writeRequest("POST", "/v1/subscription-checkouts", state, {
          name: state.name,
          priceId: state.priceId,
          customer: {
            id: state.customerId,
            email: state.customerEmail,
            ...(state.customerName === undefined ? {} : { name: state.customerName }),
          },
          ...(state.trialDays === undefined ? {} : { trialDays: state.trialDays }),
          successUrl: state.successUrl,
          cancelUrl: state.cancelUrl,
        }),
      );
  }
  return Object.freeze(builder) as SubscriptionSessionBuilder<TState>;
}

function isReady(state: SessionState): boolean {
  return (
    state.name !== undefined &&
    state.priceId !== undefined &&
    state.customerId !== undefined &&
    state.customerEmail !== undefined &&
    state.successUrl !== undefined &&
    state.cancelUrl !== undefined
  );
}
