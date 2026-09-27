import { describe, expect, it } from "vitest";
import { expectedUpdatedAtOf } from "../../src/core/builder";

describe("expectedUpdatedAtOf", () => {
  it("returns no fragment when the caller gave no expected version", () => {
    expect(expectedUpdatedAtOf({})).toBeUndefined();
  });

  it("returns the expected version the caller gave", () => {
    expect(expectedUpdatedAtOf({ expectedUpdatedAt: "2026-09-27T10:00:00Z" })).toEqual({
      expectedUpdatedAt: "2026-09-27T10:00:00Z",
    });
  });

  it("adds nothing when spread into a body without an expected version", () => {
    expect({ priceId: "price_1", ...expectedUpdatedAtOf({}) }).toEqual({ priceId: "price_1" });
  });
});
