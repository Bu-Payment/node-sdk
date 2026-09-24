# BuPayment Node SDK

Server-side client for the BuPayment machine API. Every request is signed with the
versioned BuPayment HMAC protocol and scoped to the App the credential belongs to.

Every operation is configured through a fluent, immutable builder and sent only by an
explicit terminal method. Required input is enforced by the type: the terminal does not
exist until every required field is set.

1. [Getting started](01-getting-started.md): configuration, capabilities, the builder contract.
2. [Catalogue](02-catalogue.md): products, prices, cross-sells, entitlements.
3. [Customers](03-customers.md): App-owned customer records.
4. [Checkout](04-checkout.md): coupons, tax rates, shipping rates, subscription sessions.
5. [Payments and refunds](05-payments-and-refunds.md): charges, invoices, refunds.
6. [Subscriptions](06-subscriptions.md): lifecycle and price migrations.
7. [Events and webhooks](07-events-and-webhooks.md): event reads, endpoints, deliveries.
8. [Pagination](08-pagination.md): cursor pages and the automatic walk.
9. [Errors](09-errors.md): typed error envelopes and what each code means.

---

Next: [Getting started](01-getting-started.md)
