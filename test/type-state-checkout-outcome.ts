import { checkoutOutcome, isPayableCheckout } from "../src/checkout/outcome";
import type { CheckoutStatus } from "../src/checkout/types";
import type {
  CheckoutCreatedEvent,
  CheckoutEvent,
  CheckoutOutcomeEvent,
} from "../src/webhooks/types";

declare const event: CheckoutOutcomeEvent;
declare const anyCheckoutEvent: CheckoutEvent;
declare const created: CheckoutCreatedEvent;
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

// @ts-expect-error a created checkout has no outcome yet
checkoutOutcome(created);

// @ts-expect-error any checkout event may be the created one, so it is narrowed first
checkoutOutcome(anyCheckoutEvent);

if (anyCheckoutEvent.type !== "checkout.created") {
  checkoutOutcome(anyCheckoutEvent);
}
