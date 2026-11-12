# BuPayment Node SDK

Server-side client for the BuPayment machine API. Every request is signed with the
versioned BuPayment HMAC protocol and scoped to the App the credential belongs to.

Every operation is configured through a fluent, immutable builder and sent only by an
explicit terminal method. Required input is enforced by the type: the terminal does not
exist until every required field is set.

1. [Getting started](01-getting-started.md): configuration, capabilities, the builder contract.
2. [Catalogue](02-catalogue.md): products, prices, cross-sells, entitlements, and catalogue writes.
3. [Customers](03-customers.md): App-owned customer records.
4. [Checkout](04-checkout.md): coupons, tax rates, shipping rates, one-time checkout and its outcomes, amounts in minor units, subscription sessions.
5. [Payments and refunds](05-payments-and-refunds.md): charges, invoices, refunds.
6. [Payment methods and billing](06-payment-methods-and-billing.md): stored payment methods, billing capabilities.
7. [Subscriptions](07-subscriptions.md): lifecycle and price migrations.
8. [Events and webhooks](08-events-and-webhooks.md): event reads, endpoints, deliveries, receiving and deduplicating deliveries.
9. [Pagination](09-pagination.md): cursor pages, the automatic walk and `collect()`.
10. [Errors](10-errors.md): typed error envelopes, what each code means, and the public view of a failure.
11. [Sales](11-sales.md): charging a one-time product at the displayed price, with a typed outcome and stock compensation.
12. [Product mirror](12-product-mirror.md): keeping a local product mirrored in the catalogue, safe to retry.

---

Next: [Getting started](01-getting-started.md)
