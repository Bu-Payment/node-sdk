import { afterEach, describe, expect, it, vi } from "vitest";

const original = process.env;

afterEach(() => {
  process.env = original;
});

describe("environment reads", () => {
  it("reads no variable while the package is imported", async () => {
    const read: string[] = [];
    process.env = new Proxy(original, {
      get(target, name, receiver) {
        if (typeof name === "string" && name.startsWith("BU_PAYMENT_")) {
          read.push(name);
        }
        return Reflect.get(target, name, receiver);
      },
    });
    vi.resetModules();
    const sdk = await import("../src/index");
    expect(typeof sdk.createBuPaymentClientFromEnv).toBe("function");
    expect(read).toEqual([]);
    sdk.isConfigured();
    expect(read).toContain("BU_PAYMENT_SECRET");
  });
});
