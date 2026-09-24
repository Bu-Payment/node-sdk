export interface Payment {
  id: string;
  status: string;
  amount: number;
  currency: string;
  provider: string;
  reference: string | null;
  description: string | null;
  refundedAmount: number;
  customerId: string | null;
  invoiceId: string | null;
  subscriptionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentAllocation {
  reference: string;
  amount: number;
  currency: string;
}
