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
  customerId: string;
}

export interface CreateRefundBody {
  paymentId: string;
  amount?: number;
  currency?: string;
  reason?: string;
}

export type ListRefundsQuery = {
  limit?: number;
  cursor?: string;
};
