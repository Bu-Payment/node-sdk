import { ErrorCode } from "../constants";
import { BuPaymentError } from "../errors";

export interface Collection<T> {
  data: T[];
}

export interface Page<T> extends Collection<T> {
  nextCursor: string | null;
}

export interface PageWithMore<T> extends Page<T> {
  hasMore: boolean;
}

export type CursorQuery = { cursor?: string };

export type PageReader<TItem, TQuery extends CursorQuery> = (query: TQuery) => Promise<Page<TItem>>;

export async function* paginate<TItem, TQuery extends CursorQuery>(
  read: PageReader<TItem, TQuery>,
  query: TQuery,
): AsyncGenerator<TItem, void, undefined> {
  const seen = new Set<string>();
  let cursor = query.cursor;
  for (;;) {
    const page = await read({ ...query, cursor });
    yield* page.data;
    const next = page.nextCursor;
    if (next === null) {
      return;
    }
    if (typeof next !== "string" || next === "") {
      throw malformedPage();
    }
    if (next === cursor || seen.has(next)) {
      throw repeatedCursor(next);
    }
    seen.add(next);
    cursor = next;
  }
}

function malformedPage(): BuPaymentError {
  return new BuPaymentError(
    "The API answered a page without a usable nextCursor, so pagination cannot continue",
    { code: ErrorCode.RESPONSE_INVALID },
  );
}

function repeatedCursor(cursor: string): BuPaymentError {
  return new BuPaymentError(
    "The API repeated a pagination cursor, so the remaining pages cannot be read",
    { code: ErrorCode.RESPONSE_INVALID, metadata: { cursor } },
  );
}
