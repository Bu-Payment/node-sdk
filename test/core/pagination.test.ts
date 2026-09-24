import { describe, expect, it } from "vitest";
import { type Page, paginate } from "../../src/core/pagination";

type Query = { cursor?: string; active?: boolean };

async function collect(
  pages: Page<string>[],
  query: Query = {},
): Promise<{
  items: string[];
  queries: Query[];
}> {
  const queries: Query[] = [];
  const items: string[] = [];
  let index = 0;
  const read = async (page: Query): Promise<Page<string>> => {
    queries.push(page);
    return pages[index++] ?? { data: [], nextCursor: null };
  };
  for await (const item of paginate(read, query)) {
    items.push(item);
  }
  return { items, queries };
}

describe("paginate", () => {
  it("yields every item across the pages", async () => {
    const { items } = await collect([
      { data: ["a"], nextCursor: "cur_2" },
      { data: ["b", "c"], nextCursor: null },
    ]);
    expect(items).toEqual(["a", "b", "c"]);
  });

  it("carries the original filter into every page", async () => {
    const { queries } = await collect(
      [
        { data: ["a"], nextCursor: "cur_2" },
        { data: ["b"], nextCursor: null },
      ],
      { active: true },
    );
    expect(queries).toEqual([
      { active: true, cursor: undefined },
      { active: true, cursor: "cur_2" },
    ]);
  });

  it("stops rather than loop when the API repeats the cursor", async () => {
    const { items, queries } = await collect([{ data: ["a"], nextCursor: "cur_1" }], {
      cursor: "cur_1",
    });
    expect(items).toEqual(["a"]);
    expect(queries).toHaveLength(1);
  });

  it("yields nothing for an empty first page", async () => {
    const { items } = await collect([{ data: [], nextCursor: null }]);
    expect(items).toEqual([]);
  });
});
