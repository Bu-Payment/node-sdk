# Checkout

Coupons, tax rates, shipping rates, one-time checkouts and subscription sessions all require
`checkout:create`, and each resolves only against catalogue assigned to the App.

## Coupons

```ts
const evaluation = await client.checkout
  .coupon("WELCOME")
  .unitAmount(5000)
  .currency("EUR")
  .productId("prod_1")
  .evaluate();

const redemption = await client.checkout
  .coupon("WELCOME")
  .unitAmount(5000)
  .currency("EUR")
  .reference("order_1")
  .idempotencyKey("order_1")
  .redeem();
```

`evaluate()` appears once an amount and a currency are set; `redeem()` needs a reference as
well, because it consumes one redemption and records it against that reference. Pass the
same reference as the idempotency key so a retry replays the redemption instead of
consuming a second one.

## Tax rates

```ts
const rates = await client.checkout.taxRates().productId("prod_1").country("PT").get();

const calculation = await client.checkout
  .taxRate("txr_1")
  .amount(5000)
  .productId("prod_1")
  .country("PT")
  .calculate();
```

`get()` answers `{ data }` with the rates applicable to that product and destination. It
has no cursor, and it does not exist until a product is set. `state()` is only reachable
once a country is set, which is the API's rule in the type.

`calculate()` answers the subtotal, the tax and the total in minor units, with the rounding
rule that produced them.

## Shipping rates

```ts
const shipping = await client.checkout
  .shippingRates()
  .currency("EUR")
  .destinationCountry("PT")
  .product("prod_1")
  .product("prod_2")
  .get();
```

Products accumulate one call at a time and reach the API as one comma-separated parameter.
`get()`, `all()` and `collect()` do not exist until a currency, a destination and at least one product
are set, so an empty resolution is unrepresentable rather than a runtime error. An
identifier containing a comma is refused, because the wire format would split it in two.

## One-time checkout

A one-time checkout sends the buyer to a page where the payment happens, for providers that
cannot be charged directly from a server. It is the hosted counterpart of
[Sales](11-sales.md), which charges directly.

```ts
const checkout = await client.checkout
  .sessionDraft()
  .priceId("price_1")
  .expectedUnitAmount(2900)
  .expectedCurrency("EUR")
  .customerEmail("buyer@example.com")
  .customerName("Ana Silva")
  .quantity(1)
  .destination("default")
  .provider("trust-my-travel")
  .reference(orderId)
  .idempotencyKey(orderId)
  .create();

if (checkout.checkoutUrl !== undefined) {
  redirect(checkout.checkoutUrl);
}

const current = await client.checkout.session(checkout.id).get();
```

`create()` appears once a price, a buyer, a destination and an idempotency key are set, and
stays absent while an expected amount is set without its currency. A checkout priced by an amount
needs its currency and description instead of the price; see
[A price or an amount](#a-price-or-an-amount). A client configured with a
destination, through `BU_PAYMENT_DESTINATION_KEY` or `destinationKey`, starts every draft with
it, and `destination()` replaces it for that draft. A client built from the environment offers
`create()` without `destination()` whether or not the variable is set; when neither is there,
the awaited `create()` is rejected with `configuration_missing` before anything is sent. The
default applies only here: no other builder takes a checkout destination. The
buyer is named once, by `customerId()` or by `customerEmail()`; `customerName()` exists only
after `customerEmail()`, and an email that matches an existing customer reuses it. The
idempotency key is required: use the order id, so a retry answers the same checkout. Reusing
the key with a different reference, provider, buyer or quantity is refused with
`idempotency_conflict`.

The checkout refusals below arrive with a generic `error.code` and the API's code in
`error.apiError`; see [Errors](10-errors.md#api-codes-behind-a-generic-code).

- `destination(key)` names a checkout destination of the App, configured in the dashboard,
  that holds the success and cancel URLs. The request never carries a URL. A destination that
  does not exist or is disabled is refused with `resource_conflict` and `error.apiError`
  `checkout_destination_unavailable`.
- `provider(name)` picks a provider account of the environment. Without it the environment's
  default is used; an environment with no default needs it. A name with no account answers
  `operation_failed` with `error.apiError` `checkout_provider_unknown`.
- `quantity(n)` is 1 to 100 and defaults to 1. `expectedUnitAmount()` and `expectedCurrency()`
  behave as everywhere else: the currency follows the amount, `create()` waits for both, and a
  changed price is refused with `price_changed` and `error.price` holds the current one.
- Only one-time prices are accepted; a recurring price is refused with `request_invalid`, and
  subscriptions go through `subscriptionSession()`. Only Test credentials are accepted for
  now; a Live credential is refused with `resource_conflict` and `error.apiError`
  `checkout_live_not_enabled`.

The checkout answers `status` (`pending`, `processing`, `completed`, `failed`, `expired` or
`cancelled`), `amountSource` (`price` or `app_amount`), `priceId`, `productId` and
`description` (each `null` when the path did not set it), the canonical `amount` and `currency`
(unit amount times quantity, or the amount the App sent, in minor units), `chargedAmount` and `chargedCurrency` when the provider charged a converted amount,
`expiresAt`, and `paymentId` once it is paid.

`checkoutUrl` is present only while the checkout is `pending` or `processing`. Send the buyer
there and do not store or log it: it is a bearer credential for the payment. For Trust My
Travel it is a BuPayment page that opens the provider's payment window; for SISP it is a
BuPayment page that submits the payment form; for a redirect provider it is the provider's
own page.

`checkout.created` arrives once the checkout is ready, before the buyer pays, with the amount, the
currency, the `amountSource` and the expiry; it is a record of what was opened, not an outcome.
The buyer returning to the success URL does not prove payment. Learn the outcome from
`checkout.completed`, `checkout.failed`, `checkout.expired` and `checkout.cancelled` (see
[Events and webhooks](08-events-and-webhooks.md#checkout-events)) or from
`client.checkout.session(id).get()`. A checkout that expired can still be paid afterwards:
`checkout.completed` then arrives after `checkout.expired`, and the order is paid.

`session(id)` sends nothing; `get()` reads the checkout, and an empty id is refused when it is
awaited.

### A price or an amount

A checkout is priced one of two ways, and the draft offers only one of them at a time.

Use `priceId()` when the value is fixed and kept in the catalogue: a product with a list price,
anything that also sells as a subscription, a catalogue you maintain. `quantity()` and the
`expected*` assertions belong to this path, and the API computes the total.

Use `amount()` when your App calculates the value at the moment of sale, such as a booking whose
total depends on the dates, the room and the guests:

```ts
const total = await bookings.priceFor(booking.id);

const checkout = await client.checkout
  .sessionDraft()
  .amount(total)
  .currency("EUR")
  .description(`Room ${booking.room}, ${booking.nights} nights`)
  .productId("prod_rooms")
  .customerId(customer.id)
  .reference(booking.id)
  .idempotencyKey(`${booking.id}-${total}`)
  .create();
```

`amount(n)` is the total in minor units, `currency(code)` exists only after it and
`description(text)` only after the currency; `create()` waits for all three. `productId(id)` is
optional and files the sale under a catalogue product for reporting; it does not price anything.
Once `amount()` is called, `priceId()`, `quantity()`, `expectedUnitAmount()` and
`expectedCurrency()` are gone, and once `priceId()`, `quantity()` or `expectedUnitAmount()` is
called, `amount()` is gone: a quantity multiplies a price and an assertion checks one, so either
settles the draft on the catalogue. Everything else, the buyer, the destination (including the
client's default), `provider()`, `reference()` and the idempotency key, works as on the price path.
Key the checkout on the booking and its total, as above: a retry then answers the same checkout,
and a booking whose total changed opens a new one instead of colliding with the old key.

The awaited `create()` refuses with `request_invalid`, before anything is sent, an amount that is
not a positive safe integer, a currency that is not three letters, and a description that is
empty or longer than 255 UTF-16 code units once trimmed, so an emoji counts as two. The currency
is sent in uppercase and the description trimmed; `error.metadata.field` names the value refused.

- Calculate the amount on your server, from your own records. Never take it from the browser:
  whatever the buyer can send, the buyer can change. Build the description on your server too:
  it is shown to the buyer on the payment page.
- When `checkout.completed` arrives, recalculate the total and compare it with the event's
  `amount` and `currency`, with `paidAsExpected(event)`, before you fulfil the order.
- The credential needs the `checkout:custom_amount` capability as well as `checkout:create`.
  Without it the API refuses with `operation_failed` (403) and `error.apiError`
  `checkout_custom_amount_not_allowed`.
- Only the `sisp` and `trust-my-travel` providers charge an amount. Any other provider is refused
  with `resource_conflict` (409) and `error.apiError` `checkout_custom_amount_unsupported_provider`.
- `price_changed` cannot happen here: there is no catalogue price to change.

The body carries `amount`, `currency`, `description`, `productId` when set, the buyer,
`destinationKey`, and `provider` and `reference` when set. It never carries `priceId`,
`quantity` or `expectedPrice`. The checkout answers `amountSource` `app_amount`, `priceId`
`null`, and the `description` and `productId` sent; a checkout priced from the catalogue answers
`amountSource` `price`, its `priceId`, and `description` `null`.

## Checkout outcomes

Four helpers carry the logic every hosted checkout handler needs. None of them sends a request.

```ts
import {
  checkoutOutcome,
  laterCheckoutStatus,
  minorUnits,
  paidAsExpected,
  webhookDelivery,
} from "@bu-payment/node-sdk";

const { event } = webhookDelivery().secret(secret).body(rawBody).headers(headers).verify();

switch (event.type) {
  case "checkout.completed":
  case "checkout.failed":
  case "checkout.expired":
  case "checkout.cancelled": {
    const outcome = checkoutOutcome(event);
    const order = await orders.findByCheckout(outcome.checkoutId);
    const status = laterCheckoutStatus(order.checkoutStatus, outcome.status);
    if (status === order.checkoutStatus) {
      break;
    }
    if (event.type === "checkout.completed") {
      const total = minorUnits().currency(order.currency).fromDecimal(order.total);
      if (!paidAsExpected(event).amount(total).currency(order.currency).matches()) {
        await orders.holdForReview(order.id, outcome);
        break;
      }
    }
    await orders.record(order.id, status, outcome.paymentId);
    break;
  }
}
```

`checkoutOutcome(event)` reads the four outcome events into one shape:
`{ checkoutId, reference, status, paymentId, amount, currency, chargedAmount, chargedCurrency }`.
`checkout.cancelled` carries no payment or amounts, so those fields are `null` there, never
`undefined`. The result is frozen. Its parameter is `CheckoutOutcomeEvent`, which leaves out
`checkout.created`: that event settles nothing, carries no payment and no previous status, and the
checkout it announces is the one `create()` already answered. A `CheckoutEvent` is narrowed first,
as the `switch` above does.

`laterCheckoutStatus(current, incoming)` answers the status that prevails when events arrive
late or out of order, with the precedence the API applies: `completed`, then `failed`,
`cancelled`, `expired`, `processing` and `pending`. A checkout that is already `completed` stays
`completed` when a `checkout.expired` arrives after it, and a `checkout.completed` that arrives
after an expiry wins. When the answer equals the status you hold, the event changes nothing.

`isPayableCheckout(status)` is true for `pending` and `processing`, the only statuses in which a
checkout carries a `checkoutUrl`. It narrows the status, so a buyer coming back to an order can be
sent to the open checkout:

```ts
const checkout = await client.checkout.session(order.checkoutId).get();
if (isPayableCheckout(checkout.status) && checkout.checkoutUrl !== undefined) {
  redirect(checkout.checkoutUrl);
}
```

`paidAsExpected(event)` accepts only a `checkout.completed` event. `amount()` takes the amount in
minor units, `currency()` exists only after it, and `matches()` only once both are set. It
compares the checkout's canonical `amount` and `currency`, which is the catalogue unit amount
times the quantity, or the total the App sent through `amount()`, not the converted
`chargedAmount` the provider may have charged. An amount
that is not a non-negative integer, or a currency that is not three letters, is refused with
`request_invalid` when `matches()` runs.

### Amounts in minor units

The API counts every amount in the minor unit of its currency, the exponent ISO 4217 assigns:
2 for `EUR` and `CVE`, 0 for `JPY`, 3 for `BHD`. `minorUnits().currency(code)` converts in both
directions and can be kept and reused for one currency:

```ts
const euro = minorUnits().currency("EUR");
euro.fromDecimal(19.99); // 1999
euro.fromDecimal(0.1 + 0.2); // 30
euro.toDecimal(1999); // 19.99
minorUnits().currency("JPY").fromDecimal(1500); // 1500
```

`fromDecimal()` absorbs the drift of binary floating point, so `0.1 + 0.2` counts as 30 cents,
and refuses with `request_invalid` an amount that is zero, negative, not finite, beyond the safe
integer range once converted, or that has more decimal places than the currency allows, such as
`19.999` in `EUR` or `1.5` in `JPY`. `toDecimal()` refuses anything but a positive safe integer.
A currency outside the table is refused when the conversion runs, never when `currency()` is
called. The table is ISO 4217 as the API applies it, not `Intl.NumberFormat`, whose display
digits differ from ISO 4217 for currencies such as `HUF`, `IDR` and `COP`. `MGA` and `MRU`, whose
minor units are not decimal, are refused.

## Subscription sessions

```ts
const session = await client.checkout
  .subscriptionSession()
  .name("Gold")
  .priceId("price_1")
  .customerId(customer.id)
  .customerEmail(customer.email)
  .successUrl("https://shop.example/ok")
  .cancelUrl("https://shop.example/cancel")
  .create();
```

The session answers an `id` and a `url` to redirect the buyer to. The price must be
assigned to the App and the customer must belong to it. `trialDays()` and `customerName()`
are optional; the other six are required and `create()` is absent until all six are set.

`expectedUnitAmount(amount)` followed by `expectedCurrency(code)` asserts the price the buyer
was shown; `create()` is absent while the amount is set without its currency. When the price
has changed, the session is refused with `price_changed` and `error.price` holds the
current one; see [Errors](10-errors.md#a-price-that-changed).

---

Previous: [Customers](03-customers.md) · Next: [Payments and refunds](05-payments-and-refunds.md)
