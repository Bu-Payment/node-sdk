export type InvoiceStatus = "void" | "draft" | "open" | "paid" | "uncollectible";

export interface Invoice {
  id: string;
  customerId: string;
  subscriptionId: string | null;
  status: string;
  currency: string;
  total: number;
  amountPaid: number;
  amountDue: number;
  number: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  paymentIds: string[];
  createdAt: string;
  updatedAt: string;
}
