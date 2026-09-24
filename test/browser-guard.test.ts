import { describe, expect, it } from "vitest";

describe("browser guard", () => {
  it("throws on import so a browser bundle can never load confidential code", async () => {
    await expect(import("../src/browser-guard")).rejects.toThrowError(
      /must never be bundled for a browser/u,
    );
  });

  it("is the browser condition of the package entry point", async () => {
    const manifest = await import("../package.json", { with: { type: "json" } });
    const entry = manifest.default.exports["."];

    expect(Object.keys(entry).indexOf("browser")).toBeLessThan(
      Object.keys(entry).indexOf("import"),
    );
    expect(entry.browser).toEqual({
      import: "./dist/browser-guard.js",
      require: "./dist/browser-guard.cjs",
    });
  });

  it("is the browser target of the legacy map for both builds", async () => {
    const manifest = await import("../package.json", { with: { type: "json" } });

    expect(manifest.default.browser).toEqual({
      "./dist/index.js": "./dist/browser-guard.js",
      "./dist/index.cjs": "./dist/browser-guard.cjs",
    });
  });

  it("keeps its side effects so no bundler may tree shake the throw away", async () => {
    const manifest = await import("../package.json", { with: { type: "json" } });

    expect(manifest.default.sideEffects).toEqual([
      "./dist/browser-guard.js",
      "./dist/browser-guard.cjs",
    ]);
  });
});
