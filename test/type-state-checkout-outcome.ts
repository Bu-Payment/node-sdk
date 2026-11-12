import { checkoutOutcome, isPayableCheckout } from "../src/checkout/outcome";
import type { CheckoutStatus } from "../src/checkout/types";
import type { CheckoutEvent } from "../src/webhooks/types";

declare const event: CheckoutEvent;
declare const status: CheckoutStatus;

const outcomeStatus: "completed" | "failed" | "expired" | "cancelled" =
  checkoutOutcome(event).status;
void outcomeStatus;

// @ts-expect-error an outcome is read-only
checkoutOutcome(event).amount = 1;

if (isPayableCheckout(status)) {
  const payable: "pending" | "processing" = status;
  void payable;
}
