import { type CheckoutCompletedEvent, paidAsExpected } from "../src/checkout/paid-as-expected";
import type { CheckoutEvent } from "../src/webhooks/types";

declare const completed: CheckoutCompletedEvent;
declare const event: CheckoutEvent;

const matched: boolean = paidAsExpected(completed).amount(12100).currency("EUR").matches();
void matched;

if (event.type === "checkout.completed") {
  paidAsExpected(event).amount(12100).currency("EUR").matches();
}

// @ts-expect-error only a completed checkout carries the amount that was paid
paidAsExpected(event);

if (event.type === "checkout.cancelled") {
  // @ts-expect-error a cancelled checkout was not paid
  paidAsExpected(event);
}

// @ts-expect-error the currency is set after the amount
paidAsExpected(completed).currency("EUR");

// @ts-expect-error the check needs a currency as well as an amount
paidAsExpected(completed).amount(12100).matches();

// @ts-expect-error the check needs an amount and a currency
paidAsExpected(completed).matches();

// @ts-expect-error an amount is one value, in minor units
paidAsExpected(completed).amount(121, "EUR");
