import type { createPaymentsClient } from "../src/payments/client";
import type { Payment } from "../src/payments/types";

declare const payments: ReturnType<typeof createPaymentsClient>;

const charged = payments.draft().customerId("cus_1").priceId("price_1");
const withMethod = charged.paymentMethodId("pm_1");

// @ts-expect-error allocations require a payment method
charged.allocationReference("line_1");

// @ts-expect-error an allocation is no longer taken as three positional values
withMethod.allocation("line_1", 100, "EUR");

// @ts-expect-error the allocation amount follows its reference
withMethod.allocationAmount(100);

// @ts-expect-error the allocation currency follows its amount
withMethod.allocationCurrency("EUR");

// @ts-expect-error the allocation currency follows its amount, not only its reference
withMethod.allocationReference("line_1").allocationCurrency("EUR");

// @ts-expect-error a second allocation waits for the first to be closed
withMethod.allocationReference("line_1").allocationReference("line_2");

// @ts-expect-error a payment cannot be created while an allocation lacks its amount
withMethod.allocationReference("line_1").create();

// @ts-expect-error a payment cannot be created while an allocation lacks its currency
withMethod.allocationReference("line_1").allocationAmount(100).create();

const created: Promise<Payment> = withMethod
  .allocationReference("line_1")
  .allocationAmount(100)
  .allocationCurrency("EUR")
  .allocationReference("line_2")
  .allocationAmount(200)
  .allocationCurrency("EUR")
  .create();
void created;

void withMethod.create();
