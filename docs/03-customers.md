# Customers

BuPayment isolates customer records by App. End-user authentication belongs to the
consuming application: decide there whether a buyer is signed in or a guest, then supply
the customer data the operation needs. Sessions, roles and claims are not part of this
contract.

Requires `customers:read` to read and `customers:write` to mutate.

```ts
const customer = await client.customers.create({
  email: "buyer@example.com",
  name: "Buyer",
});

const found = await client.customers.list({ email: "buyer@example.com" });
const one = await client.customers.get(customer.id);

await client.customers.update(customer.id, { name: "Renamed" });
```

`update` accepts `null` for `name` to clear it. At least one field is required.

Listing pages on a cursor bound to the email filter:

```ts
for await (const record of client.customers.listAll({ email: "buyer@example.com" })) {
  console.log(record.id);
}
```

---

Previous: [Catalogue](02-catalogue.md) · Next: [Checkout](04-checkout.md)
