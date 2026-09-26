import { describe, expect, it } from "vitest";
import type { Price } from "../src/catalogue/types";
import { ErrorCode, Header } from "../src/constants";
import type { BuPaymentError } from "../src/errors";
import { callAt, harnessOf, harnessReturning, json, pathOf } from "./support/harness";

const productUpdatedAt = "2026-01-02T00:00:00.000Z";

const UUID = /^[0-9a-f-]{36}$/u;

describe("price replacement", () => {
  const replacement = { id: "price_2", unitAmount: 1_200 } as Price;
  const archived = { id: "price_1", active: false, updatedAt: productUpdatedAt } as Price;
  const change = (client: ReturnType<typeof harnessReturning>["client"]) =>
    client.catalogue.createPrice("prod_1").unitAmount(1_200).currency("EUR").replacing("price_1");

  it("creates the replacement before archiving the previous price", async () => {
    const { client, calls } = harnessReturning(replacement, archived);
    const result = await change(client).expectedUpdatedAt(productUpdatedAt).replace();
    expect(result).toEqual({ outcome: "replaced", replacement, archived });
    expect(calls.map((call) => `${call.method} ${pathOf(call)}`)).toEqual([
      "POST /v1/products/prod_1/prices",
      "POST /v1/prices/price_1/archive",
    ]);
    expect(callAt(calls, 0).body).toEqual({ unitAmount: 1_200, currency: "EUR" });
    expect(callAt(calls, 1).body).toEqual({ expectedUpdatedAt: productUpdatedAt });
    expect(callAt(calls, 0).headers[Header.IDEMPOTENCY_KEY]).toMatch(UUID);
    expect(callAt(calls, 1).headers[Header.IDEMPOTENCY_KEY]).toMatch(UUID);
    expect(callAt(calls, 1).headers[Header.IDEMPOTENCY_KEY]).not.toBe(
      callAt(calls, 0).headers[Header.IDEMPOTENCY_KEY],
    );
  });

  it("reports a failed archive with the replacement it already created", async () => {
    const { client, calls } = harnessOf((_call, index) =>
      index === 0 ? json(replacement) : json({ error: "stale_resource", resource: archived }, 409),
    );
    const result = await change(client).replace();
    expect(calls).toHaveLength(2);
    expect(result.outcome).toBe("archive_failed");
    if (result.outcome !== "archive_failed") {
      return;
    }
    expect(result.replacement).toEqual(replacement);
    expect(result.previousPriceId).toBe("price_1");
    expect(result.error).toMatchObject({ code: ErrorCode.STALE_RESOURCE, resource: archived });
  });

  it("rejects without archiving when the replacement cannot be created", async () => {
    const { client, calls } = harnessOf(() => json({ error: "request_invalid" }, 400));
    await expect(change(client).replace()).rejects.toMatchObject({
      code: ErrorCode.REQUEST_INVALID,
    });
    expect(calls).toHaveLength(1);
  });

  it("replays both steps under the same keys when the same builder is retried", async () => {
    const { client, calls } = harnessOf((_call, index) =>
      index === 1
        ? json({ error: "operation_failed" }, 503)
        : json(index === 3 ? archived : replacement),
    );
    const replacing = change(client);
    const failed = await replacing.replace();
    const retried = await replacing.replace();
    expect(failed.outcome).toBe("archive_failed");
    expect(retried).toEqual({ outcome: "replaced", replacement, archived });
    const keys = calls.map((call) => call.headers[Header.IDEMPOTENCY_KEY]);
    expect(keys[2]).toBe(keys[0]);
    expect(keys[3]).toBe(keys[1]);
  });

  it("keeps the replacement's key when only the observed version changes", async () => {
    const { client, calls } = harnessOf((_call, index) =>
      index === 1
        ? json({ error: "stale_resource", resource: archived }, 409)
        : json(index === 3 ? archived : replacement),
    );
    const replacing = change(client).expectedUpdatedAt("2026-01-01T00:00:00.000Z");
    const failed = await replacing.replace();
    if (failed.outcome !== "archive_failed") {
      throw new Error("expected the archive to fail");
    }
    const current = (failed.error as BuPaymentError<Price>).resource;
    await replacing.expectedUpdatedAt(current?.updatedAt ?? "").replace();
    const keys = calls.map((call) => call.headers[Header.IDEMPOTENCY_KEY]);
    expect(keys[2]).toBe(keys[0]);
    expect(callAt(calls, 3).body).toEqual({ expectedUpdatedAt: productUpdatedAt });
  });

  it("reports a default price the API refuses to archive", async () => {
    const { client } = harnessOf((_call, index) =>
      index === 0 ? json(replacement) : json({ error: "default_price_in_use" }, 409),
    );
    const result = await change(client).replace();
    expect(result).toMatchObject({
      outcome: "archive_failed",
      replacement,
      error: { code: ErrorCode.RESOURCE_CONFLICT, metadata: { apiError: "default_price_in_use" } },
    });
  });

  it("sends the caller's key on both steps", async () => {
    const { client, calls } = harnessReturning(replacement, archived);
    await change(client).idempotencyKey("reprice-gold").replace();
    expect(calls.map((call) => call.headers[Header.IDEMPOTENCY_KEY])).toEqual([
      "reprice-gold",
      "reprice-gold",
    ]);
  });

  it("refuses an empty previous price before creating anything", async () => {
    const { client, calls } = harnessReturning(replacement);
    await expect(
      client.catalogue.createPrice("prod_1").unitAmount(1).currency("EUR").replacing("").replace(),
    ).rejects.toMatchObject({ code: ErrorCode.REQUEST_INVALID });
    expect(calls).toHaveLength(0);
  });
});
