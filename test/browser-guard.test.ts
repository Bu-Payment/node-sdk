import { describe, expect, it } from "vitest";

describe("browser guard", () => {
  it("throws on import so a browser bundle can never load confidential code", async () => {
    await expect(import("../src/browser-guard")).rejects.toThrowError(
      /must never be bundled for a browser/u,
    );
  });

  it("is the browser target for both package entry points", async () => {
    const manifest = await import("../package.json", { with: { type: "json" } });
    expect(manifest.default.browser).toEqual({
      "./dist/index.js": "./dist/browser-guard.js",
      "./dist/index.cjs": "./dist/browser-guard.cjs",
    });
    expect(Object.keys(manifest.default.exports["."])).not.toContain("browser");
  });
});
