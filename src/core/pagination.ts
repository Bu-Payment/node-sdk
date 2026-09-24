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
  let cursor = query.cursor;
  for (;;) {
    const page = await read({ ...query, cursor });
    yield* page.data;
    if (page.nextCursor === null || page.nextCursor === cursor) {
      return;
    }
    cursor = page.nextCursor;
  }
}
