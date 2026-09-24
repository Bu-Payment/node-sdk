# @bu-payment/node-sdk

Confidential BuPayment client for Node.js servers. Every request is signed with the versioned
BuPayment HMAC protocol.

This package holds a confidential secret and must never reach a browser. Public browser
applications use [`@bu-payment/browser-sdk`](https://github.com/Bu-Payment/browser-sdk), which is
built for the publishable key and cannot sign confidential requests.

## Install

```sh
bun add @bu-payment/node-sdk
```

## Configuration

```ts
import { parseClientConfig } from "@bu-payment/node-sdk";

const config = parseClientConfig({
  applicationId: process.env.BUPAYMENT_APP_ID!,
  keyId: process.env.BUPAYMENT_KEY_ID!,
  secret: process.env.BUPAYMENT_SECRET!,
  apiBaseUrl: process.env.BUPAYMENT_API_BASE_URL!,
});
```

The environment is derived from the key ID, so a test credential can never be pointed at live by
configuration alone. The secret is parsed into its 32 HMAC key bytes and wrapped so that string
conversion, `JSON.stringify`, `util.inspect`, and thrown error metadata all render `[redacted]`.

Keep the secret in a secret manager or an environment variable that is never committed, never
logged, and never sent to a browser.

## Requirements

Node.js 20 or later. The package ships ESM and CommonJS builds with TypeScript declarations, and
has no runtime dependencies.

## Development

```sh
bun install
bun run check
```

`bun run check` runs lint, type checking, tests with coverage, and the build.
