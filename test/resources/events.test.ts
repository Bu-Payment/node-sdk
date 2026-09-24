import { describe, expect, it } from "vitest";
import { callAt, harnessReturning, pathOf, queryOf } from "./harness";

describe("EventsResource", () => {
  it("lists events by type", async () => {
    const { client, calls } = harnessReturning({ data: [], nextCursor: null });
    await client.events.list({ type: "payment.succeeded", limit: 10 });
    expect(calls).toHaveLength(1);
    expect(callAt(calls, 0).method).toBe("GET");
    expect(pathOf(callAt(calls, 0))).toBe("/v1/events");
    expect(queryOf(callAt(calls, 0))).toBe("?type=payment.succeeded&limit=10");
  });

  it("walks every event page keeping the type filter the cursor is bound to", async () => {
    const { client, calls } = harnessReturning(
      { data: [{ id: "evt_1" }], nextCursor: "cur_2" },
      { data: [{ id: "evt_2" }], nextCursor: null },
    );
    const collected: string[] = [];
    for await (const event of client.events.listAll({ type: "payment.succeeded" })) {
      collected.push(event.id);
    }
    expect(collected).toEqual(["evt_1", "evt_2"]);
    expect(queryOf(callAt(calls, 1))).toBe("?type=payment.succeeded&cursor=cur_2");
  });

  it("reads one event", async () => {
    const { client, calls } = harnessReturning({ id: "evt_1" });
    await client.events.get("evt_1");
    expect(calls).toHaveLength(1);
    expect(pathOf(callAt(calls, 0))).toBe("/v1/events/evt_1");
  });
});
