import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const vectors = JSON.parse(
  readFileSync(join(packageRoot, "conformance/v1/conformance-vectors.json"), "utf8"),
);
const vector = vectors.success[0];
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

  run("bun", ["install"], workspace);
  run("node", ["esm-check.mjs"], workspace);
  run("node", ["cjs-check.cjs"], workspace);
  run("bunx", ["tsc", "--project", "tsconfig.json"], workspace);
  process.stdout.write("installed consumer: ESM, CommonJS and declarations verified\n");
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

function esmCheck(vector) {
  return `import assert from "node:assert/strict";
import { BuPaymentClient, buildCanonicalRequest, signCanonicalRequest, ConfidentialSecret } from "@bu-payment/node-sdk";

${signatureAssertion(vector)}
assert.equal(typeof BuPaymentClient, "function");
`;
}

function cjsCheck(vector) {
  return `const assert = require("node:assert/strict");
const { BuPaymentClient, buildCanonicalRequest, signCanonicalRequest, ConfidentialSecret } = require("@bu-payment/node-sdk");

${signatureAssertion(vector)}
assert.equal(typeof BuPaymentClient, "function");
`;
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
import type { ClientConfigInput, TransportRequest } from "@bu-payment/node-sdk/types";

const input: ClientConfigInput = {
  applicationId: "app_123",
  keyId: "bup_ck_test_A12345678901234567890123",
  secret: "bup_sec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
  apiBaseUrl: "https://api.bupayment.test",
};

const request: TransportRequest = { method: "GET", path: "/v1/products" };

export async function probe(): Promise<unknown> {
  const client = new BuPaymentClient(input);
  const code: typeof ErrorCode.RESOURCE_NOT_FOUND = ErrorCode.RESOURCE_NOT_FOUND;
  void code;
  return await client.request(request);
}
`;
}
