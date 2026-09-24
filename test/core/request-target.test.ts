import { describe, expect, it } from "vitest";
import { ErrorCode } from "../../src/constants";
import { buildRequestTarget, encodePathSegment } from "../../src/core/request-target";

const baseUrl = new URL("https://api.bupayment.test/");
const nestedBaseUrl = new URL("https://api.bupayment.test/gateway/");

describe("buildRequestTarget", () => {
  it("keeps the signed path aligned with the transmitted URL", () => {
    const target = buildRequestTarget(baseUrl, "/v1/products");
    expect(target).toEqual({
      url: "https://api.bupayment.test/v1/products",
      rawPath: "/v1/products",
      rawQuery: "",
    });
  });

  it("prefixes the base path without doubling its slash", () => {
    expect(buildRequestTarget(nestedBaseUrl, "/v1/products").url).toBe(
      "https://api.bupayment.test/gateway/v1/products",
    );
  });

  it("encodes spaces as %20 and a plus as a literal byte", () => {
    const target = buildRequestTarget(baseUrl, "/v1/products", { q: "a b+c" });
    expect(target.rawQuery).toBe("q=a%20b%2Bc");
    expect(target.url.endsWith("?q=a%20b%2Bc")).toBe(true);
  });

  it("preserves repeated query values in caller order", () => {
    expect(buildRequestTarget(baseUrl, "/v1/products", { tag: ["b", "a"] }).rawQuery).toBe(
      "tag=b&tag=a",
    );
  });

  it("drops undefined query values and keeps empty strings", () => {
    expect(
      buildRequestTarget(baseUrl, "/v1/products", { cursor: undefined, search: "" }).rawQuery,
    ).toBe("search=");
  });

  it("encodes non-ASCII query values as UTF-8 bytes", () => {
    expect(buildRequestTarget(baseUrl, "/v1/products", { q: "café" }).rawQuery).toBe("q=caf%C3%A9");
  });

  it("refuses a path that does not start with a slash", () => {
    expect(() => buildRequestTarget(baseUrl, "v1/products")).toThrowError(/start with a slash/u);
  });
});

describe("encodePathSegment", () => {
  it("keeps a slash inside its segment", () => {
    expect(encodePathSegment("a/b")).toBe("a%2Fb");
  });

  it("leaves unreserved characters untouched", () => {
    expect(encodePathSegment("prod_1-2.3~4")).toBe("prod_1-2.3~4");
  });

  it("refuses an empty segment", () => {
    const error = (() => {
      try {
        encodePathSegment("");
        return undefined;
      } catch (caught) {
        return caught as { code: string };
      }
    })();
    expect(error?.code).toBe(ErrorCode.REQUEST_INVALID);
  });
});
