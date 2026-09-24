import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const vectors = JSON.parse(
  readFileSync(join(packageRoot, "conformance/v1/conformance-vectors.json"), "utf8"),
);
const vector = vectors.success[0];
const esbuild = join(packageRoot, "node_modules/.bin/esbuild");
const guardMessage = "must never be bundled for a browser";
const workspace = mkdtempSync(join(tmpdir(), "bu-payment-node-sdk-consumer-"));

try {
  run("bun", ["run", "build"], packageRoot);
  run("bun", ["pm", "pack", "--destination", workspace], packageRoot);
  const tarball = readdirSync(workspace).find((entry) => entry.endsWith(".tgz"));
  if (tarball === undefined) {
    throw new Error("bun pm pack produced no tarball");
  }

  writeFileSync(
    join(workspace, "package.json"),
    `${JSON.stringify(
      {
        name: "bu-payment-node-sdk-consumer",
        private: true,
        version: "0.0.0",
        type: "module",
        dependencies: { "@bu-payment/node-sdk": `file:./${tarball}` },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(workspace, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          noEmit: true,
          skipLibCheck: true,
        },
        include: ["types-check.ts"],
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(workspace, "esm-check.mjs"), esmCheck(vector));
  writeFileSync(join(workspace, "cjs-check.cjs"), cjsCheck(vector));
  writeFileSync(join(workspace, "types-check.ts"), typesCheck());
  writeFileSync(join(workspace, "browser-esm-entry.mjs"), 'import "@bu-payment/node-sdk";\n');
  writeFileSync(join(workspace, "browser-cjs-entry.cjs"), 'require("@bu-payment/node-sdk");\n');

  run("bun", ["install"], workspace);
  run("node", ["esm-check.mjs"], workspace);
  run("node", ["cjs-check.cjs"], workspace);
  run("bunx", ["tsc", "--project", "tsconfig.json"], workspace);
  process.stdout.write("installed consumer: ESM, CommonJS and declarations verified\n");

  expectGuard(
    ["node", ["--conditions=browser", "browser-esm-entry.mjs"]],
    "node browser condition",
  );
  bundleForBrowser("browser-esm-entry.mjs", "esm", "neutral", "browser-esm-neutral.mjs");
  bundleForBrowser("browser-esm-entry.mjs", "esm", "browser", "browser-esm-browser.mjs");
  bundleForBrowser("browser-cjs-entry.cjs", "cjs", "browser", "browser-cjs-browser.cjs");
  process.stdout.write("browser guard verified: ESM and CommonJS bundles refuse to load\n");
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

function bundleForBrowser(entry, format, platform, outfile) {
  run(
    esbuild,
    [
      entry,
      "--bundle",
      "--tree-shaking=true",
      `--format=${format}`,
      `--platform=${platform}`,
      "--conditions=browser",
      `--outfile=${outfile}`,
    ],
    workspace,
  );
  expectGuard(["node", [outfile]], `${format} bundle on platform ${platform}`);
}

function expectGuard([command, args], label) {
  const result = spawnSync(command, args, { cwd: workspace, encoding: "utf8" });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.error !== undefined) {
    throw new Error(`${label}: could not be run: ${result.error.message}`);
  }
  if (result.signal !== null) {
    throw new Error(`${label}: killed by signal ${result.signal}`);
  }
  if (result.status === 0) {
    throw new Error(`${label}: loaded the confidential SDK instead of throwing the browser guard`);
  }
  if (!output.includes(guardMessage)) {
    throw new Error(`${label}: failed without the browser guard message\n${output}`);
  }
}

function esmCheck(vector) {
  return `import assert from "node:assert/strict";
import { BuPaymentClient, buildCanonicalRequest, signCanonicalRequest, ConfidentialSecret } from "@bu-payment/node-sdk";

${signatureAssertion(vector)}
assert.equal(typeof BuPaymentClient, "function");
${commerceAssertion(vector)}
`;
}

function cjsCheck(vector) {
  return `const assert = require("node:assert/strict");
const { BuPaymentClient, buildCanonicalRequest, signCanonicalRequest, ConfidentialSecret } = require("@bu-payment/node-sdk");

${signatureAssertion(vector)}
assert.equal(typeof BuPaymentClient, "function");
${commerceAssertion(vector)}
`;
}

function commerceAssertion(vector) {
  return `const commerceClient = new BuPaymentClient({
  applicationId: ${JSON.stringify(vector.appId)},
  keyId: ${JSON.stringify(vector.keyId)},
  secret: ${JSON.stringify(vector.confidentialSecret)},
  apiBaseUrl: "https://api.bupayment.test",
});
for (const resource of [
  "products",
  "prices",
  "customers",
  "coupons",
  "taxRates",
  "shippingRates",
  "subscriptionCheckouts",
  "payments",
  "subscriptions",
  "subscriptionPriceMigrations",
  "invoices",
  "refunds",
  "events",
  "webhookEndpoints",
  "webhookDeliveries",
]) {
  assert.equal(typeof commerceClient[resource], "object", resource);
}
assert.equal(typeof commerceClient.products.list, "function");
assert.equal(typeof commerceClient.products.listAll, "function");

async function assertScopeGuards() {
  await assert.rejects(
    commerceClient.payments.create({ customerId: "cus_1", priceId: "price_1", amount: 1 }),
    (error) => error.code === "request_invalid",
  );
  await assert.rejects(
    commerceClient.request({
      method: "POST",
      path: "/v1/customers",
      body: { appId: "app_other" },
    }),
    (error) => error.code === "request_invalid",
  );
}

assertScopeGuards().catch((error) => {
  console.error(error);
  process.exit(1);
});`;
}

function signatureAssertion(vector) {
  return `const canonicalRequest = buildCanonicalRequest({
  applicationId: ${JSON.stringify(vector.appId)},
  keyId: ${JSON.stringify(vector.keyId)},
  timestamp: ${JSON.stringify(vector.timestamp)},
  nonce: ${JSON.stringify(vector.nonce)},
  method: ${JSON.stringify(vector.method)},
  rawPath: ${JSON.stringify(vector.rawPath)},
});
assert.equal(canonicalRequest, ${JSON.stringify(vector.canonicalRequest)});
assert.equal(
  signCanonicalRequest(ConfidentialSecret.parse(${JSON.stringify(vector.confidentialSecret)}), canonicalRequest),
  ${JSON.stringify(vector.signature)},
);`;
}

function typesCheck() {
  return `import { BuPaymentClient, ErrorCode } from "@bu-payment/node-sdk";
import type {
  ClientConfigInput,
  CreatePaymentBody,
  ListProductsQuery,
  Page,
  Product,
  TransportRequest,
} from "@bu-payment/node-sdk/types";

const input: ClientConfigInput = {
  applicationId: "app_123",
  keyId: "bup_ck_test_A12345678901234567890123",
  secret: "bup_sec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
  apiBaseUrl: "https://api.bupayment.test",
};

const request: TransportRequest = { method: "GET", path: "/v1/products" };
const productQuery: ListProductsQuery = { active: true, limit: 10 };
const canonicalPayment: CreatePaymentBody = { customerId: "cus_1", priceId: "price_1" };
const adHocPayment: CreatePaymentBody = { customerId: "cus_1", amount: 100, currency: "EUR" };
// @ts-expect-error an ad hoc amount must never override a canonical price
const conflictingPayment: CreatePaymentBody = {
  customerId: "cus_1",
  priceId: "price_1",
  amount: 100,
  currency: "EUR",
};
void conflictingPayment;

export async function probe(): Promise<unknown> {
  const client = new BuPaymentClient(input);
  const code: typeof ErrorCode.RESOURCE_NOT_FOUND = ErrorCode.RESOURCE_NOT_FOUND;
  void code;
  const page: Page<Product> = await client.products.list(productQuery);
  const name: string = page.data[0]?.name ?? "";
  void name;
  void client.payments.create(canonicalPayment);
  void client.payments.create(adHocPayment);
  for await (const product of client.products.listAll(productQuery)) {
    void product.id;
  }
  return await client.request(request);
}
`;
}
