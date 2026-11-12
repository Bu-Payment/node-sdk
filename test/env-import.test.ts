import { afterEach, describe, expect, it, vi } from "vitest";

const original = process.env;

afterEach(() => {
  process.env = original;
});

describe("environment reads", () => {
  it("reads no variable while the package is imported", async () => {
    const read: string[] = [];
    const record = (name: string | symbol) => {
      if (typeof name === "string" && name.startsWith("BU_PAYMENT_")) {
        read.push(name);
      }
    };
    process.env = new Proxy(original, {
      get(target, name, receiver) {
        record(name);
        return Reflect.get(target, name, receiver);
      },
      has(target, name) {
        record(name);
        return Reflect.has(target, name);
      },
      getOwnPropertyDescriptor(target, name) {
        record(name);
        return Reflect.getOwnPropertyDescriptor(target, name);
      },
      ownKeys(target) {
        read.push("*");
        return Reflect.ownKeys(target);
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
