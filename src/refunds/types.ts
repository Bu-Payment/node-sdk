export interface Refund {
  id: string;
  paymentId: string;
  status: string;
  amount: number;
  currency: string;
  provider: string;
  providerRefundId: string | null;
  reason: string | null;
  createdAt: string;
}

export interface OwnedRefund extends Refund {
  customerId: string;
}
