# Customers

BuPayment isolates customer records by App. End-user authentication belongs to the
consuming application: decide there whether a buyer is signed in or a guest, then supply
the customer data the operation needs. Sessions, roles and claims are not part of this
contract.

Requires `customers:read` to read and `customers:write` to mutate.

```ts
const customer = await client.customers
  .create()
  .email("buyer@example.com")
  .name("Buyer")
  .idempotencyKey(`signup-${signupId}`)
  .create();

const found = await client.customers.list().email("buyer@example.com").get();
const one = await client.customers.customer(customer.id).get();

await client.customers.customer(customer.id).name("Renamed").update();
```

`create()` does not exist until an email is set, and `update()` does not exist until at
least one field is set, which is the API's own rule expressed in the type. Pass `null` to
`name()` on an update to clear it.

Listing pages on a cursor bound to the email filter:

```ts
for await (const record of client.customers.list().email("buyer@example.com").all()) {
  console.log(record.id);
}
```

---

Previous: [Catalogue](02-catalogue.md) · Next: [Checkout](04-checkout.md)
