import { describe, expect, it } from "vitest";
import { ErrorCode } from "../src/constants";
import { callAt, harnessOf, harnessReturning, json, pathOf } from "./support/harness";

type Client = ReturnType<typeof harnessReturning>["client"];

const records = {
  product: (client: Client) => client.catalogue.product("rec_1"),
  price: (client: Client) => client.catalogue.price("rec_1"),
};

describe.each(Object.keys(records))("find on a catalogue %s", (name) => {
  const record = records[name as keyof typeof records];
  const pathPart = name === "product" ? "/products/rec_1" : "/prices/rec_1";

  it("reads its own path only once called", async () => {
    const { client, calls } = harnessReturning({ id: "rec_1" });
    const builder = record(client);
    expect(calls).toHaveLength(0);
    await builder.find();
    expect(calls).toHaveLength(1);
    expect(pathOf(callAt(calls, 0))).toContain(pathPart);
  });

  it.each([
    ["an unavailable API", json({ error: "operation_failed" }, 503)],
    ["refused credentials", json({ error: "application_auth_invalid" }, 401)],
    ["a denied capability", json({ error: "application_capability_denied" }, 403)],
    ["a 404 page from a proxy", new Response("<html>nginx</html>", { status: 404 })],
    ["an empty 404", new Response("", { status: 404 })],
    ["a JSON 404 with no API error", json({ message: "no route" }, 404)],
  ])("throws on %s instead of resolving to null", async (_case, response) => {
    const { client } = harnessOf(() => response.clone());
    await expect(record(client).find()).rejects.toBeInstanceOf(Error);
  });

  it("marks a not-found the API did not state as read from the status", async () => {
    const { client } = harnessOf(() => new Response("<html>nginx</html>", { status: 404 }));
    await expect(record(client).get()).rejects.toMatchObject({
      code: ErrorCode.RESOURCE_NOT_FOUND,
      metadata: { codeFromStatus: true },
    });
  });

  it("resolves to null when the API itself answers not found", async () => {
    const { client } = harnessOf(() => json({ error: "resource_not_found" }, 404));
    expect(await record(client).find()).toBeNull();
  });
});
