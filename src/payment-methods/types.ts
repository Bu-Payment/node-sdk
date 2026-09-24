export type PaymentMethodStatus =
  | "active"
  | "replacement_required"
  | "revoked"
  | "permanently_invalid";

export interface PaymentMethodExpiry {
  month: number;
  year: number;
}

export interface PaymentMethod {
  id: string;
  status: PaymentMethodStatus;
  brand?: string;
  lastDigits?: string;
  expiry?: PaymentMethodExpiry;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentMethodList {
  data: PaymentMethod[];
  hasMore: false;
  nextCursor: null;
}

export interface PaymentMethodSetupStatusAction {
  method: "GET";
  url: string;
}

export interface PaymentMethodSetupConfirmAction {
  method: "POST";
  url: string;
}

export interface PaymentMethodSetupRedirect {
  kind: "redirect";
  url: string;
}

export type SettledPaymentMethodSetupStatus = "processing" | "succeeded" | "failed" | "expired";

interface PaymentMethodSetupIdentity {
  id: string;
  expiresAt: string;
  paymentMethod?: PaymentMethod;
}

export interface PaymentMethodSetupRequiringAction extends PaymentMethodSetupIdentity {
  status: "requires_action";
  presentationVersion: 1;
  presentation: PaymentMethodSetupRedirect;
  actions: {
    status: PaymentMethodSetupStatusAction;
    confirm: PaymentMethodSetupConfirmAction;
  };
}

export interface SettledPaymentMethodSetup extends PaymentMethodSetupIdentity {
  status: SettledPaymentMethodSetupStatus;
  presentationVersion?: never;
  presentation?: never;
  actions: {
    status: PaymentMethodSetupStatusAction;
    confirm?: never;
  };
}

export type PaymentMethodSetup = PaymentMethodSetupRequiringAction | SettledPaymentMethodSetup;
