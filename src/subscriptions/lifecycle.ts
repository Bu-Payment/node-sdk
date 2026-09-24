import type { RequestScope, ScopeMethods, Sender } from "../core/builder";
import { scopeMethods, writeRequest } from "../core/builder";
import type { PaymentCollectionBehavior, ResumeBillingPolicy, SubscriptionDetail } from "./types";

type Keyed = RequestScope & { idempotencyKey?: string };

interface CancellationState extends Keyed {
  timing?: "immediate" | "period_end";
}

interface CancellationMethods<TState extends CancellationState>
  extends ScopeMethods<CancellationBuilder<TState>> {
  timing(
    timing: "immediate" | "period_end",
  ): CancellationBuilder<TState & { timing: "immediate" | "period_end" }>;
  idempotencyKey(idempotencyKey: string): CancellationBuilder<TState>;
}

export interface CancellableSubscription {
  cancel(): Promise<SubscriptionDetail>;
}

export type CancellationBuilder<TState extends CancellationState = CancellationState> =
  CancellationMethods<TState> &
    (TState extends { timing: "immediate" | "period_end" } ? CancellableSubscription : object);

interface PauseSubscriptionState extends Keyed {
  effectiveTiming?: "immediate" | "nextRenewal";
  resumeBillingPolicy?: ResumeBillingPolicy;
  resumeAt?: string | null;
}

interface PauseSubscriptionMethods<TState extends PauseSubscriptionState>
  extends ScopeMethods<PauseSubscriptionBuilder<TState>> {
  effectiveTiming(
    effectiveTiming: "immediate" | "nextRenewal",
  ): PauseSubscriptionBuilder<TState & { effectiveTiming: "immediate" | "nextRenewal" }>;
  resumeBillingPolicy(
    resumeBillingPolicy: ResumeBillingPolicy,
  ): PauseSubscriptionBuilder<TState & { resumeBillingPolicy: ResumeBillingPolicy }>;
  resumeAt(resumeAt: string | null): PauseSubscriptionBuilder<TState>;
  idempotencyKey(idempotencyKey: string): PauseSubscriptionBuilder<TState>;
}

export interface PausableSubscription {
  pause(): Promise<SubscriptionDetail>;
}

export type PauseSubscriptionBuilder<
  TState extends PauseSubscriptionState = PauseSubscriptionState,
> = PauseSubscriptionMethods<TState> &
  (TState extends {
    effectiveTiming: "immediate" | "nextRenewal";
    resumeBillingPolicy: ResumeBillingPolicy;
  }
    ? PausableSubscription
    : object);

interface PauseCollectionState extends Keyed {
  behavior?: PaymentCollectionBehavior;
  resumesAt?: string | null;
}

interface PauseCollectionMethods<TState extends PauseCollectionState>
  extends ScopeMethods<PauseCollectionBuilder<TState>> {
  behavior(
    behavior: PaymentCollectionBehavior,
  ): PauseCollectionBuilder<TState & { behavior: PaymentCollectionBehavior }>;
  resumesAt(resumesAt: string | null): PauseCollectionBuilder<TState>;
  idempotencyKey(idempotencyKey: string): PauseCollectionBuilder<TState>;
}

export type PauseCollectionBuilder<TState extends PauseCollectionState = PauseCollectionState> =
  PauseCollectionMethods<TState> &
    (TState extends { behavior: PaymentCollectionBehavior } ? PausableSubscription : object);

interface ResumePausedState extends Keyed {
  effectiveTiming?: "immediate" | "scheduled";
  effectiveAt?: string;
  billingPolicy?: ResumeBillingPolicy;
}

interface ResumePausedMethods<TState extends ResumePausedState>
  extends ScopeMethods<ResumePausedBuilder<TState>> {
  immediately(): ResumePausedBuilder<TState & { effectiveTiming: "immediate" }>;
  scheduledAt(
    effectiveAt: string,
  ): ResumePausedBuilder<TState & { effectiveTiming: "scheduled"; effectiveAt: string }>;
  billingPolicy(
    billingPolicy: ResumeBillingPolicy,
  ): ResumePausedBuilder<TState & { billingPolicy: ResumeBillingPolicy }>;
  idempotencyKey(idempotencyKey: string): ResumePausedBuilder<TState>;
}

export interface ResumableSubscription {
  resume(): Promise<SubscriptionDetail>;
}

export type ResumePausedBuilder<TState extends ResumePausedState = ResumePausedState> =
  ResumePausedMethods<TState> &
    (TState extends {
      effectiveTiming: "immediate" | "scheduled";
      billingPolicy: ResumeBillingPolicy;
    }
      ? ResumableSubscription
      : object);

export interface PlainResumeBuilder
  extends ScopeMethods<PlainResumeBuilder>,
    ResumableSubscription {
  idempotencyKey(idempotencyKey: string): PlainResumeBuilder;
}

export function cancellation<TState extends CancellationState>(
  send: Sender,
  path: string,
  state: TState,
): CancellationBuilder<TState> {
  const next = (update: Partial<CancellationState>) =>
    cancellation(send, path, { ...state, ...update });
  const builder: Record<string, unknown> = {
    ...scopeMethods(next),
    timing: (timing: "immediate" | "period_end") => next({ timing }),
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
  };
  if (state.timing !== undefined) {
    builder.cancel = () => post(send, `${path}/cancel`, state, { timing: state.timing });
  }
  return Object.freeze(builder) as CancellationBuilder<TState>;
}

export function pauseSubscription<TState extends PauseSubscriptionState>(
  send: Sender,
  path: string,
  state: TState,
): PauseSubscriptionBuilder<TState> {
  const next = (update: Partial<PauseSubscriptionState>) =>
    pauseSubscription(send, path, { ...state, ...update });
  const builder: Record<string, unknown> = {
    ...scopeMethods(next),
    effectiveTiming: (effectiveTiming: "immediate" | "nextRenewal") => next({ effectiveTiming }),
    resumeBillingPolicy: (resumeBillingPolicy: ResumeBillingPolicy) =>
      next({ resumeBillingPolicy }),
    resumeAt: (resumeAt: string | null) => next({ resumeAt }),
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
  };
  if (state.effectiveTiming !== undefined && state.resumeBillingPolicy !== undefined) {
    builder.pause = () =>
      post(send, `${path}/pause`, state, {
        target: "subscription",
        effectiveTiming: state.effectiveTiming,
        resumeBillingPolicy: state.resumeBillingPolicy,
        ...(state.resumeAt === undefined ? {} : { resumeAt: state.resumeAt }),
      });
  }
  return Object.freeze(builder) as PauseSubscriptionBuilder<TState>;
}

export function pauseCollection<TState extends PauseCollectionState>(
  send: Sender,
  path: string,
  state: TState,
): PauseCollectionBuilder<TState> {
  const next = (update: Partial<PauseCollectionState>) =>
    pauseCollection(send, path, { ...state, ...update });
  const builder: Record<string, unknown> = {
    ...scopeMethods(next),
    behavior: (behavior: PaymentCollectionBehavior) => next({ behavior }),
    resumesAt: (resumesAt: string | null) => next({ resumesAt }),
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
  };
  if (state.behavior !== undefined) {
    builder.pause = () =>
      post(send, `${path}/pause`, state, {
        target: "payment_collection",
        behavior: state.behavior,
        ...(state.resumesAt === undefined ? {} : { resumesAt: state.resumesAt }),
      });
  }
  return Object.freeze(builder) as PauseCollectionBuilder<TState>;
}

export function resumePaused<TState extends ResumePausedState>(
  send: Sender,
  path: string,
  state: TState,
): ResumePausedBuilder<TState> {
  const next = (update: Partial<ResumePausedState>) =>
    resumePaused(send, path, { ...state, ...update });
  const builder: Record<string, unknown> = {
    ...scopeMethods(next),
    immediately: () => next({ effectiveTiming: "immediate" }),
    scheduledAt: (effectiveAt: string) => next({ effectiveTiming: "scheduled", effectiveAt }),
    billingPolicy: (billingPolicy: ResumeBillingPolicy) => next({ billingPolicy }),
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
  };
  if (state.effectiveTiming !== undefined && state.billingPolicy !== undefined) {
    builder.resume = () =>
      post(send, `${path}/resume`, state, {
        target: "paused_subscription",
        effectiveTiming: state.effectiveTiming,
        ...(state.effectiveAt === undefined ? {} : { effectiveAt: state.effectiveAt }),
        billingPolicy: state.billingPolicy,
      });
  }
  return Object.freeze(builder) as ResumePausedBuilder<TState>;
}

export function plainResume(
  send: Sender,
  path: string,
  target: "pending_cancellation" | "payment_collection",
  state: Keyed,
): PlainResumeBuilder {
  const next = (update: Partial<Keyed>) => plainResume(send, path, target, { ...state, ...update });
  return Object.freeze({
    ...scopeMethods(next),
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
    resume: () => post(send, `${path}/resume`, state, { target }),
  });
}

function post(
  send: Sender,
  path: string,
  state: Keyed,
  body: Record<string, unknown>,
): Promise<SubscriptionDetail> {
  return send<SubscriptionDetail>(writeRequest("POST", path, state, body));
}
