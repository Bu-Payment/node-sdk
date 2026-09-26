import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { typesCheck } from "./consumer-types-probe.mjs";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const vectors = JSON.parse(
  readFileSync(join(packageRoot, "conformance/v1/conformance-vectors.json"), "utf8"),
);
const vector = vectors.success[0];
const webhookVector = JSON.parse(
  readFileSync(join(packageRoot, "test/fixtures/webhook-delivery.json"), "utf8"),
);
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
          exactOptionalPropertyTypes: true,
          noUncheckedIndexedAccess: true,
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
import { createBuPaymentClient, buildCanonicalRequest, signCanonicalRequest, ConfidentialSecret, verifyWebhookDelivery } from "@bu-payment/node-sdk";

${signatureAssertion(vector)}
${webhookAssertion()}
assert.equal(typeof createBuPaymentClient, "function");
${commerceAssertion(vector)}
`;
}

function cjsCheck(vector) {
  return `const assert = require("node:assert/strict");
const { createBuPaymentClient, buildCanonicalRequest, signCanonicalRequest, ConfidentialSecret, verifyWebhookDelivery } = require("@bu-payment/node-sdk");

${signatureAssertion(vector)}
${webhookAssertion()}
assert.equal(typeof createBuPaymentClient, "function");
${commerceAssertion(vector)}
`;
}

function webhookAssertion() {
  return `const delivery = verifyWebhookDelivery({
  body: Buffer.from(${JSON.stringify(webhookVector.body)}),
  headers: {
    "x-webhook-id": ${JSON.stringify(webhookVector.deliveryId)},
    "x-webhook-timestamp": ${JSON.stringify(webhookVector.timestamp)},
    "x-webhook-signature": ${JSON.stringify(webhookVector.signature)},
  },
  secret: ${JSON.stringify(webhookVector.secret)},
  now: () => ${Number(webhookVector.timestamp)},
});
assert.equal(delivery.deliveryId, ${JSON.stringify(webhookVector.deliveryId)});
assert.throws(
  () => verifyWebhookDelivery({ body: {}, headers: {}, secret: ${JSON.stringify(webhookVector.secret)} }),
  (error) => error.code === "webhook_payload_invalid",
);`;
}

function commerceAssertion(vector) {
  return `const commerceClient = createBuPaymentClient({
  applicationId: ${JSON.stringify(vector.appId)},
  keyId: ${JSON.stringify(vector.keyId)},
  secret: ${JSON.stringify(vector.confidentialSecret)},
  apiBaseUrl: "https://api.bupayment.test",
});
assert.ok(Object.isFrozen(commerceClient), "client must be frozen");
for (const [domain, entry] of [
  ["catalogue", "products"],
  ["customers", "create"],
  ["checkout", "subscriptionSession"],
  ["payments", "create"],
  ["paymentMethods", "createSetup"],
  ["billing", "capabilities"],
  ["invoices", "list"],
  ["refunds", "create"],
  ["subscriptions", "create"],
  ["priceMigrations", "list"],
  ["events", "list"],
  ["webhooks", "createEndpoint"],
]) {
  assert.ok(commerceClient[domain], domain);
  assert.equal(typeof commerceClient[domain][entry], "function", domain + "." + entry);
}

const productsBuilder = commerceClient.catalogue.products();
assert.ok(Object.isFrozen(productsBuilder), "builder must be frozen");
assert.notEqual(productsBuilder.limit(10), productsBuilder, "builder must be immutable");
assert.equal(typeof productsBuilder.get, "function");

const incompletePayment = commerceClient.payments.create().customerId("cus_1");
assert.equal(incompletePayment.create, undefined, "terminal must be absent until priced");
assert.equal(
  commerceClient.payments.create().priceId("price_1").amount,
  undefined,
  "an ad hoc amount must be absent once priced canonically",
);
assert.equal(
  commerceClient.paymentMethods.createSetup("cus_1").currency("EUR").returnUrl("https://shop.test/r")
    .create,
  undefined,
  "a payment method setup must be absent until the consent is set",
);
assert.equal(
  commerceClient.paymentMethods.list("cus_1").all,
  undefined,
  "a payment method list must offer no walk",
);

async function assertScopeGuards() {
  await assert.rejects(
    commerceClient.request({
      method: "POST",
      path: "/v1/customers",
      body: { appId: "app_other" },
    }),
    (error) => error.code === "request_invalid",
  );
  await assert.rejects(
    commerceClient.request({
      method: "GET",
      path: "/v1/products",
      query: { workspace_id: "ws_other" },
    }),
    (error) => error.code === "request_invalid",
  );
}

process.exitCode = 1;
assertScopeGuards().then(
  () => {
    process.exitCode = 0;
  },
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);`;
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
