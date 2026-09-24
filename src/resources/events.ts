import { type Page, paginate } from "../core/pagination";
import type { ListEventsQuery, PlatformEvent } from "../models/events";
import { Resource } from "./resource";

export class EventsResource extends Resource {
  list(query: ListEventsQuery = {}): Promise<Page<PlatformEvent>> {
    return this.send({ method: "GET", path: "/v1/events", query });
  }

  listAll(query: ListEventsQuery = {}): AsyncGenerator<PlatformEvent, void, undefined> {
    return paginate((page: ListEventsQuery) => this.list(page), query);
  }

  get(eventId: string): Promise<PlatformEvent> {
    return this.send({ method: "GET", path: `/v1/events/${this.segment(eventId)}` });
  }
}
