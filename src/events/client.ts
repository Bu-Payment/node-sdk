import {
  type CursorScope,
  type DeferredSender,
  deferSender,
  type PageMethods,
  pageMethods,
  pageQuery,
  type RequestScope,
  readRequest,
  type ScopeMethods,
  type Sender,
  scopeMethods,
} from "../core/builder";
import type { Page } from "../core/pagination";
import { encodePathSegment } from "../core/request-target";
import type { PlatformEvent } from "./types";

interface EventListState extends CursorScope {
  type?: string;
}

export interface EventListBuilder extends PageMethods<EventListBuilder, PlatformEvent> {
  type(type: string): EventListBuilder;
}

export interface EventBuilder extends ScopeMethods<EventBuilder> {
  get(): Promise<PlatformEvent>;
}

export interface EventsClient {
  list(): EventListBuilder;
  event(eventId: string): EventBuilder;
}

export function createEventsClient(dispatch: Sender): EventsClient {
  const send = deferSender(dispatch);
  return Object.freeze({
    list: () => eventList(send, {}),
    event: (eventId: string) => singleEvent(send, eventId, {}),
  });
}

function eventList(send: DeferredSender, state: EventListState): EventListBuilder {
  const next = (update: Partial<EventListState>) => eventList(send, { ...state, ...update });
  const read = (page: EventListState) =>
    send<Page<PlatformEvent>>(() =>
      readRequest(
        "/v1/events",
        page,
        pageQuery(page, page.type === undefined ? {} : { type: page.type }),
      ),
    );
  return Object.freeze({
    ...pageMethods(state, next, read),
    type: (type: string) => next({ type }),
  });
}

function singleEvent(send: DeferredSender, eventId: string, state: RequestScope): EventBuilder {
  const next = (update: Partial<RequestScope>) =>
    singleEvent(send, eventId, { ...state, ...update });
  return Object.freeze({
    ...scopeMethods(next),
    get: () =>
      send<PlatformEvent>(() => readRequest(`/v1/events/${encodePathSegment(eventId)}`, state)),
  });
}
