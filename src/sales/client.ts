import type { CustomersClient } from "../customers/client";
import type { PaymentsClient } from "../payments/client";
import { chargeSale } from "./charge";
import { type CompleteSale, type SaleDraft, saleDraft } from "./draft";

export interface SalesClient {
  draft(): SaleDraft<Record<never, never>>;
}

export function createSalesClient(
  customers: CustomersClient,
  payments: PaymentsClient,
): SalesClient {
  const charge = (sale: CompleteSale) => chargeSale(customers, payments, sale);
  return Object.freeze({ draft: () => saleDraft(charge, {}) });
}
