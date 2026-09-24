# Errors

Every failure is a `BuPaymentError` carrying a `code`, and where the API answered, a
`status`, a `requestId` and `metadata`.

```ts
import { BuPaymentError, ErrorCode } from "@bu-payment/node-sdk";

try {
  await client.payments.get("pay_1");
} catch (error) {
  if (error instanceof BuPaymentError && error.code === ErrorCode.RESOURCE_NOT_FOUND) {
    return null;
  }
  throw error;
}
```

## Codes

| Code | Raised when |
| --- | --- |
| `configuration_invalid` | The client configuration is malformed. |
| `request_invalid` | The SDK or the API refused the request as built. |
| `request_cancelled` | The caller's `AbortSignal` fired. |
| `network_unavailable` | The API could not be reached, or the request timed out. |
| `response_invalid` | The API answered something that is not JSON. |
| `resource_not_found` | The resource is unknown, unassigned, or owned by another App. |
| `resource_conflict` | The mutation conflicts with current App-owned state. |
| `application_auth_required` | The request carried no credential. |
| `application_auth_malformed` | The signed request is not well formed. |
| `application_auth_version_unsupported` | The signature version is not accepted. |
| `application_auth_expired` | The signed timestamp is outside the accepted window. |
| `application_auth_replayed` | The nonce has already been used. |
| `application_auth_invalid` | The credential no longer resolves to an active App. |
| `application_capability_denied` | The credential lacks the route's capability. |
| `too_many_requests` | The credential is rate limited; read `metadata.retryAfter`. |
| `application_auth_unavailable` | Authentication or ownership storage is unavailable. |
| `operation_failed` | The API failed for a reason with no more specific code. |

## What a not-found does not tell you

A resource owned by another App, an unassigned catalogue identifier and an identifier that
never existed all answer `resource_not_found`. Do not read existence out of it, and do not
retry against another environment: Test and Live never share commerce data.

## Refusals before signing

These checks run in the SDK, before a request is signed, and all raise `request_invalid`:

- a body or query carrying a scope key: `workspace`, `environment`, `application`, `app`,
  `tenant`, `provider`, `providerAccountId` or `providerAccountVersion`, with or without an
  `Id` suffix, in any casing and with any separator. The body is checked as it will be
  serialized, so a `toJSON` cannot hide a key, and nesting depth is not a way past it;
- a payment priced both by `priceId` and by `amount` or `currency`, priced by neither,
  carrying an `amount` without a `currency`, or carrying `allocations` without a
  `paymentMethodId`;
- a shipping resolution with no product identifier, or one containing a comma, which the
  wire format would split into two.

`paginate` and every `listAll` raise `response_invalid` when the API answers a cursor it
has already served, or a page whose `nextCursor` is missing or empty. Both would otherwise
end the walk in silence, or repeat it forever.

---

Previous: [Pagination](08-pagination.md) · Next: [Index](00-index.md)
