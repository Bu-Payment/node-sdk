import { describe, expect, it } from "vitest";
import { ErrorCode } from "../../src/constants";
import { type Page, paginate } from "../../src/core/pagination";

type Query = { cursor?: string; active?: boolean };

interface Walk {
  items: string[];
  queries: Query[];
}

function readerOf(pages: Partial<Page<string>>[]): {
  read: (query: Query) => Promise<Page<string>>;
  queries: Query[];
} {
  const queries: Query[] = [];
  let index = 0;
  const read = async (query: Query): Promise<Page<string>> => {
    queries.push(query);
    const page = pages[index];
    index += 1;
    return (page ?? { data: [], nextCursor: null }) as Page<string>;
  };
  return { read, queries };
}

async function collect(pages: Partial<Page<string>>[], query: Query = {}): Promise<Walk> {
  const { read, queries } = readerOf(pages);
  const items: string[] = [];
  for await (const item of paginate(read, query)) {
    items.push(item);
  }
  return { items, queries };
}

describe("paginate", () => {
  it("yields every item across the pages", async () => {
    const { items, queries } = await collect([
      { data: ["a"], nextCursor: "cur_2" },
      { data: ["b", "c"], nextCursor: null },
    ]);
    expect(items).toEqual(["a", "b", "c"]);
    expect(queries).toHaveLength(2);
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

  it("refuses a cursor the API hands back unchanged", async () => {
    const { read } = readerOf([{ data: ["a"], nextCursor: "cur_1" }]);
    await expect(drain(paginate(read, { cursor: "cur_1" }))).rejects.toMatchObject({
      code: ErrorCode.RESPONSE_INVALID,
    });
  });

  it("refuses a cursor the API repeats mid-walk", async () => {
    const { read, queries } = readerOf([
      { data: ["a"], nextCursor: "cur_2" },
      { data: ["b"], nextCursor: "cur_2" },
    ]);
    await expect(drain(paginate(read, {}))).rejects.toMatchObject({
      code: ErrorCode.RESPONSE_INVALID,
    });
    expect(queries).toHaveLength(2);
  });

  it("refuses a cursor the API reuses from an earlier page", async () => {
    const { read } = readerOf([
      { data: ["a"], nextCursor: "cur_2" },
      { data: ["b"], nextCursor: "cur_3" },
      { data: ["c"], nextCursor: "cur_2" },
    ]);
    await expect(drain(paginate(read, {}))).rejects.toMatchObject({
      code: ErrorCode.RESPONSE_INVALID,
    });
  });

  it("refuses a page whose envelope omits the cursor instead of walking it again", async () => {
    const { read, queries } = readerOf([{ data: ["a"], nextCursor: "cur_2" }, { data: ["b"] }]);
    await expect(drain(paginate(read, {}))).rejects.toMatchObject({
      code: ErrorCode.RESPONSE_INVALID,
    });
    expect(queries).toHaveLength(2);
  });

  it("refuses an empty cursor", async () => {
    const { read } = readerOf([{ data: ["a"], nextCursor: "" }]);
    await expect(drain(paginate(read, {}))).rejects.toMatchObject({
      code: ErrorCode.RESPONSE_INVALID,
    });
  });

  it("yields nothing for an empty first page", async () => {
    const { items, queries } = await collect([{ data: [], nextCursor: null }]);
    expect(items).toEqual([]);
    expect(queries).toHaveLength(1);
  });
});

async function drain(walk: AsyncGenerator<string, void, undefined>): Promise<string[]> {
  const items: string[] = [];
  for await (const item of walk) {
    items.push(item);
  }
  return items;
}
