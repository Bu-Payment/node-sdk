import {
  type RequestScope,
  readRequest,
  type ScopeMethods,
  type Sender,
  scopeMethods,
  writeRequest,
} from "../core/builder";
import { encodePathSegment } from "../core/request-target";
import type {
  CreatedWebhookEndpoint,
  DeletedWebhookEndpoint,
  WebhookDelivery,
  WebhookDeliveryRetry,
  WebhookDeliveryStatus,
  WebhookEndpoint,
  WebhookEndpointStatus,
} from "./types";

interface EndpointFields {
  url?: string;
  description?: string | null;
  enabledEvents?: string[];
  status?: WebhookEndpointStatus;
}

type EndpointState = EndpointFields & RequestScope & { idempotencyKey?: string };

interface DraftMethods<TState extends EndpointState> extends ScopeMethods<EndpointDraft<TState>> {
  url(url: string): EndpointDraft<TState & { url: string }>;
  description(description: string): EndpointDraft<TState>;
  event(eventType: string): EndpointDraft<TState>;
  idempotencyKey(idempotencyKey: string): EndpointDraft<TState>;
}

export interface CreatableEndpoint {
  create(): Promise<CreatedWebhookEndpoint>;
}

export type EndpointDraft<TState extends EndpointState = EndpointState> = DraftMethods<TState> &
  (TState extends { url: string } ? CreatableEndpoint : object);

interface EndpointMethods<TState extends EndpointState>
  extends ScopeMethods<EndpointBuilder<TState>> {
  url(url: string): EndpointBuilder<TState & { url: string }>;
  description(description: string | null): EndpointBuilder<TState & { description: string | null }>;
  event(eventType: string): EndpointBuilder<TState & { enabledEvents: string[] }>;
  status(
    status: WebhookEndpointStatus,
  ): EndpointBuilder<TState & { status: WebhookEndpointStatus }>;
  idempotencyKey(idempotencyKey: string): EndpointBuilder<TState>;
  get(): Promise<WebhookEndpoint>;
  remove(): Promise<DeletedWebhookEndpoint>;
}

export interface UpdatableEndpoint {
  update(): Promise<WebhookEndpoint>;
}

export type EndpointBuilder<TState extends EndpointState = EndpointState> =
  EndpointMethods<TState> &
    (TState extends
      | { url: string }
      | { description: string | null }
      | { enabledEvents: string[] }
      | { status: WebhookEndpointStatus }
      ? UpdatableEndpoint
      : object);

interface DeliveryListState extends RequestScope {
  status?: WebhookDeliveryStatus;
  limit?: number;
}

export interface DeliveryListBuilder extends ScopeMethods<DeliveryListBuilder> {
  status(status: WebhookDeliveryStatus): DeliveryListBuilder;
  limit(limit: number): DeliveryListBuilder;
  get(): Promise<WebhookDelivery[]>;
}

export interface DeliveryBuilder extends ScopeMethods<DeliveryBuilder> {
  idempotencyKey(idempotencyKey: string): DeliveryBuilder;
  get(): Promise<WebhookDelivery>;
  retry(): Promise<WebhookDeliveryRetry>;
}

export interface EndpointListBuilder extends ScopeMethods<EndpointListBuilder> {
  get(): Promise<WebhookEndpoint[]>;
}

export interface WebhooksClient {
  endpoints(): EndpointListBuilder;
  endpoint(endpointId: string): EndpointBuilder<Record<never, never>>;
  createEndpoint(): EndpointDraft<Record<never, never>>;
  deliveries(): DeliveryListBuilder;
  delivery(deliveryId: string): DeliveryBuilder;
}

export function createWebhooksClient(send: Sender): WebhooksClient {
  return Object.freeze({
    endpoints: () => endpointList(send, {}),
    endpoint: (endpointId: string) => endpointBuilder(send, endpointId, {}),
    createEndpoint: () => endpointDraft(send, {}),
    deliveries: () => deliveryList(send, {}),
    delivery: (deliveryId: string) => deliveryBuilder(send, deliveryId, {}),
  });
}

function endpointList(send: Sender, state: RequestScope): EndpointListBuilder {
  const next = (update: Partial<RequestScope>) => endpointList(send, { ...state, ...update });
  return Object.freeze({
    ...scopeMethods(next),
    get: () => send<WebhookEndpoint[]>(readRequest("/v1/webhook-endpoints", state)),
  });
}

function endpointDraft<TState extends EndpointState>(
  send: Sender,
  state: TState,
): EndpointDraft<TState> {
  const next = (update: Partial<EndpointState>) => endpointDraft(send, { ...state, ...update });
  const builder: Record<string, unknown> = {
    ...scopeMethods(next),
    url: (url: string) => next({ url }),
    description: (description: string) => next({ description }),
    event: (eventType: string) => next({ enabledEvents: appendEvent(state, eventType) }),
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
  };
  if (state.url !== undefined) {
    builder.create = () =>
      send<CreatedWebhookEndpoint>(
        writeRequest("POST", "/v1/webhook-endpoints", state, endpointFields(state)),
      );
  }
  return Object.freeze(builder) as EndpointDraft<TState>;
}

function endpointBuilder<TState extends EndpointState>(
  send: Sender,
  endpointId: string,
  state: TState,
): EndpointBuilder<TState> {
  const path = () => `/v1/webhook-endpoints/${encodePathSegment(endpointId)}`;
  const next = (update: Partial<EndpointState>) =>
    endpointBuilder(send, endpointId, { ...state, ...update });
  const builder: Record<string, unknown> = {
    ...scopeMethods(next),
    url: (url: string) => next({ url }),
    description: (description: string | null) => next({ description }),
    event: (eventType: string) => next({ enabledEvents: appendEvent(state, eventType) }),
    status: (status: WebhookEndpointStatus) => next({ status }),
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
    get: () => send<WebhookEndpoint>(readRequest(path(), state)),
    remove: () => send<DeletedWebhookEndpoint>(writeRequest("DELETE", path(), state)),
  };
  if (hasEndpointField(state)) {
    builder.update = () =>
      send<WebhookEndpoint>(writeRequest("PATCH", path(), state, endpointFields(state)));
  }
  return Object.freeze(builder) as EndpointBuilder<TState>;
}

function deliveryList(send: Sender, state: DeliveryListState): DeliveryListBuilder {
  const next = (update: Partial<DeliveryListState>) => deliveryList(send, { ...state, ...update });
  return Object.freeze({
    ...scopeMethods(next),
    status: (status: WebhookDeliveryStatus) => next({ status }),
    limit: (limit: number) => next({ limit }),
    get: () =>
      send<WebhookDelivery[]>(
        readRequest("/v1/webhook-deliveries", state, {
          ...(state.status === undefined ? {} : { status: state.status }),
          ...(state.limit === undefined ? {} : { limit: state.limit }),
        }),
      ),
  });
}

function deliveryBuilder(
  send: Sender,
  deliveryId: string,
  state: RequestScope & { idempotencyKey?: string },
): DeliveryBuilder {
  const path = () => `/v1/webhook-deliveries/${encodePathSegment(deliveryId)}`;
  const next = (update: Partial<RequestScope & { idempotencyKey?: string }>) =>
    deliveryBuilder(send, deliveryId, { ...state, ...update });
  return Object.freeze({
    ...scopeMethods(next),
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
    get: () => send<WebhookDelivery>(readRequest(path(), state)),
    retry: () => send<WebhookDeliveryRetry>(writeRequest("POST", `${path()}/retry`, state)),
  });
}

function appendEvent(state: EndpointFields, eventType: string): string[] {
  return [...(state.enabledEvents ?? []), eventType];
}

function hasEndpointField(state: EndpointFields): boolean {
  return (
    state.url !== undefined ||
    state.description !== undefined ||
    state.enabledEvents !== undefined ||
    state.status !== undefined
  );
}

function endpointFields(state: EndpointFields): EndpointFields {
  return {
    ...(state.url === undefined ? {} : { url: state.url }),
    ...(state.description === undefined ? {} : { description: state.description }),
    ...(state.enabledEvents === undefined ? {} : { enabledEvents: state.enabledEvents }),
    ...(state.status === undefined ? {} : { status: state.status }),
  };
}
