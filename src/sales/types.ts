import type { CurrentPrice, ExpectedPrice } from "../catalogue/types";
import type { BuPaymentError } from "../errors";
import type { Payment } from "../payments/types";

export interface SaleReservation {
  reserve: () => boolean | Promise<boolean>;
  release: () => void | Promise<void>;
}

export type SaleResult =
  | { outcome: "paid"; payment: Payment }
  | { outcome: "unpaid"; payment: Payment }
  | { outcome: "price_changed"; shown: ExpectedPrice; current: CurrentPrice | null }
  | { outcome: "unconfirmed"; error: BuPaymentError }
  | { outcome: "needs_reconciliation"; error: BuPaymentError }
  | { outcome: "unavailable" };
