import type { RequestScope, ScopeMethods, Sender } from "../core/builder";
import { scopeMethods, writeRequest } from "../core/builder";
import type {
  MigrationPaymentFailurePolicy,
  MigrationProrationPolicy,
  MigrationTiming,
  SubscriptionPriceMigration,
} from "../price-migrations/types";

export interface MigrationDraftState extends RequestScope {
  targetPriceId?: string;
  itemId?: string;
  quantity?: number;
  timing?: MigrationTiming;
  prorationPolicy?: MigrationProrationPolicy;
  paymentFailurePolicy?: MigrationPaymentFailurePolicy;
  idempotencyKey?: string;
}

interface DraftMethods<TState extends MigrationDraftState>
  extends ScopeMethods<MigrationDraft<TState>> {
  targetPriceId(targetPriceId: string): MigrationDraft<TState & { targetPriceId: string }>;
  itemId(itemId: string): MigrationDraft<TState>;
  quantity(quantity: number): MigrationDraft<TState>;
  immediately(): MigrationDraft<TState & { timing: MigrationTiming }>;
  atNextRenewal(): MigrationDraft<TState & { timing: MigrationTiming }>;
  scheduledAt(effectiveAt: string): MigrationDraft<TState & { timing: MigrationTiming }>;
  prorationPolicy(
    prorationPolicy: MigrationProrationPolicy,
  ): MigrationDraft<TState & { prorationPolicy: MigrationProrationPolicy }>;
  paymentFailurePolicy(
    paymentFailurePolicy: MigrationPaymentFailurePolicy,
  ): MigrationDraft<TState & { paymentFailurePolicy: MigrationPaymentFailurePolicy }>;
  idempotencyKey(idempotencyKey: string): MigrationDraft<TState>;
}

export interface CreatableMigration {
  create(): Promise<SubscriptionPriceMigration>;
}

type MigrationReady = {
  targetPriceId: string;
  timing: MigrationTiming;
  prorationPolicy: MigrationProrationPolicy;
  paymentFailurePolicy: MigrationPaymentFailurePolicy;
};

export type MigrationDraft<TState extends MigrationDraftState = MigrationDraftState> =
  DraftMethods<TState> & (TState extends MigrationReady ? CreatableMigration : object);

export function migrationDraft<TState extends MigrationDraftState>(
  send: Sender,
  subscriptionPath: string,
  state: TState,
): MigrationDraft<TState> {
  const next = (update: Partial<MigrationDraftState>) =>
    migrationDraft(send, subscriptionPath, { ...state, ...update });
  const builder: Record<string, unknown> = {
    ...scopeMethods(next),
    targetPriceId: (targetPriceId: string) => next({ targetPriceId }),
    itemId: (itemId: string) => next({ itemId }),
    quantity: (quantity: number) => next({ quantity }),
    immediately: () => next({ timing: { kind: "immediate" } }),
    atNextRenewal: () => next({ timing: { kind: "nextRenewal" } }),
    scheduledAt: (effectiveAt: string) => next({ timing: { kind: "scheduled", effectiveAt } }),
    prorationPolicy: (prorationPolicy: MigrationProrationPolicy) => next({ prorationPolicy }),
    paymentFailurePolicy: (paymentFailurePolicy: MigrationPaymentFailurePolicy) =>
      next({ paymentFailurePolicy }),
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
  };
  if (isReady(state)) {
    builder.create = () =>
      send<SubscriptionPriceMigration>(
        writeRequest("POST", `${subscriptionPath}/price-migrations`, state, {
          targetPriceId: state.targetPriceId,
          ...(state.itemId === undefined ? {} : { itemId: state.itemId }),
          ...(state.quantity === undefined ? {} : { quantity: state.quantity }),
          timing: state.timing,
          prorationPolicy: state.prorationPolicy,
          paymentFailurePolicy: state.paymentFailurePolicy,
        }),
      );
  }
  return Object.freeze(builder) as MigrationDraft<TState>;
}

function isReady(state: MigrationDraftState): boolean {
  return (
    state.targetPriceId !== undefined &&
    state.timing !== undefined &&
    state.prorationPolicy !== undefined &&
    state.paymentFailurePolicy !== undefined
  );
}
