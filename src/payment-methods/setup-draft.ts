import type { DeferredSender, RequestScope, ScopeMethods } from "../core/builder";
import { scopeMethods, writeRequest } from "../core/builder";
import type { PaymentMethodSetup } from "./types";

export interface PaymentMethodSetupState extends RequestScope {
  currency?: string;
  returnUrl?: string;
  consentAcceptedAt?: string;
  replacesPaymentMethodId?: string;
  idempotencyKey?: string;
}

type Draft<TState extends PaymentMethodSetupState> = PaymentMethodSetupDraft<TState>;

interface SetupMethods<TState extends PaymentMethodSetupState> extends ScopeMethods<Draft<TState>> {
  currency(currency: string): Draft<TState & { currency: string }>;
  returnUrl(returnUrl: string): Draft<TState & { returnUrl: string }>;
  consentAcceptedAt(acceptedAt: string): Draft<TState & { consentAcceptedAt: string }>;
  replacesPaymentMethodId(paymentMethodId: string): Draft<TState>;
  idempotencyKey(idempotencyKey: string): Draft<TState>;
}

export interface CreatablePaymentMethodSetup {
  create(): Promise<PaymentMethodSetup>;
}

export type PaymentMethodSetupDraft<
  TState extends PaymentMethodSetupState = PaymentMethodSetupState,
> = SetupMethods<TState> &
  (TState extends { currency: string; returnUrl: string; consentAcceptedAt: string }
    ? CreatablePaymentMethodSetup
    : object);

export function paymentMethodSetupDraft<TState extends PaymentMethodSetupState>(
  send: DeferredSender,
  path: () => string,
  state: TState,
): PaymentMethodSetupDraft<TState> {
  const next = (update: Partial<PaymentMethodSetupState>) =>
    paymentMethodSetupDraft(send, path, { ...state, ...update });
  const builder: Record<string, unknown> = {
    ...scopeMethods(next),
    currency: (currency: string) => next({ currency }),
    returnUrl: (returnUrl: string) => next({ returnUrl }),
    consentAcceptedAt: (consentAcceptedAt: string) => next({ consentAcceptedAt }),
    replacesPaymentMethodId: (replacesPaymentMethodId: string) => next({ replacesPaymentMethodId }),
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
  };
  if (isCreatable(state)) {
    builder.create = () =>
      send<PaymentMethodSetup>(() => writeRequest("POST", path(), state, bodyOf(state)));
  }
  return Object.freeze(builder) as PaymentMethodSetupDraft<TState>;
}

function isCreatable(state: PaymentMethodSetupState): boolean {
  return (
    state.currency !== undefined &&
    state.returnUrl !== undefined &&
    state.consentAcceptedAt !== undefined
  );
}

function bodyOf(state: PaymentMethodSetupState): Record<string, unknown> {
  return {
    currency: state.currency,
    returnUrl: state.returnUrl,
    ...(state.replacesPaymentMethodId === undefined
      ? {}
      : { replacesPaymentMethodId: state.replacesPaymentMethodId }),
    consent: { type: "merchant_initiated_future_payments", acceptedAt: state.consentAcceptedAt },
  };
}
