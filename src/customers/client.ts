import {
  type CursorScope,
  type PageMethods,
  pageMethods,
  pageQuery,
  type RequestScope,
  readRequest,
  type ScopeMethods,
  type Sender,
  scopeMethods,
  writeRequest,
} from "../core/builder";
import type { Page } from "../core/pagination";
import { encodePathSegment } from "../core/request-target";
import type { Customer } from "./types";

interface CustomerListState extends CursorScope {
  email?: string;
}

interface CustomerFields {
  email?: string;
  name?: string | null;
}

type DraftState = CustomerFields & RequestScope & { idempotencyKey?: string };

export interface CustomerListBuilder extends PageMethods<CustomerListBuilder, Customer> {
  email(email: string): CustomerListBuilder;
}

interface DraftMethods<TState extends DraftState> extends ScopeMethods<CustomerDraft<TState>> {
  email(email: string): CustomerDraft<TState & { email: string }>;
  name(name: string): CustomerDraft<TState & { name: string }>;
  idempotencyKey(idempotencyKey: string): CustomerDraft<TState>;
}

export interface CreatableCustomer {
  create(): Promise<Customer>;
}

export type CustomerDraft<TState extends DraftState = DraftState> = DraftMethods<TState> &
  (TState extends { email: string } ? CreatableCustomer : object);

interface CustomerMethods<TState extends DraftState> extends ScopeMethods<CustomerBuilder<TState>> {
  email(email: string): CustomerBuilder<TState & { email: string }>;
  name(name: string | null): CustomerBuilder<TState & { name: string | null }>;
  idempotencyKey(idempotencyKey: string): CustomerBuilder<TState>;
  get(): Promise<Customer>;
}

export interface UpdatableCustomer {
  update(): Promise<Customer>;
}

export type CustomerBuilder<TState extends DraftState = DraftState> = CustomerMethods<TState> &
  (TState extends { email: string } | { name: string | null } ? UpdatableCustomer : object);

export interface CustomersClient {
  list(): CustomerListBuilder;
  customer(customerId: string): CustomerBuilder<Record<never, never>>;
  create(): CustomerDraft<Record<never, never>>;
}

export function createCustomersClient(send: Sender): CustomersClient {
  return Object.freeze({
    list: () => customerList(send, {}),
    customer: (customerId: string) => customerBuilder(send, customerId, {}),
    create: () => customerDraft(send, {}),
  });
}

function customerList(send: Sender, state: CustomerListState): CustomerListBuilder {
  const next = (update: Partial<CustomerListState>) => customerList(send, { ...state, ...update });
  const read = (page: CustomerListState) =>
    send<Page<Customer>>(
      readRequest(
        "/v1/customers",
        page,
        pageQuery(page, page.email === undefined ? {} : { email: page.email }),
      ),
    );
  return Object.freeze({
    ...pageMethods(state, next, read),
    email: (email: string) => next({ email }),
  });
}

function customerDraft<TState extends DraftState>(
  send: Sender,
  state: TState,
): CustomerDraft<TState> {
  const next = (update: Partial<DraftState>) => customerDraft(send, { ...state, ...update });
  const builder: Record<string, unknown> = {
    ...scopeMethods(next),
    email: (email: string) => next({ email }),
    name: (name: string) => next({ name }),
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
  };
  if (state.email !== undefined) {
    builder.create = () =>
      send<Customer>(writeRequest("POST", "/v1/customers", state, fieldsOf(state)));
  }
  return Object.freeze(builder) as CustomerDraft<TState>;
}

function customerBuilder<TState extends DraftState>(
  send: Sender,
  customerId: string,
  state: TState,
): CustomerBuilder<TState> {
  const path = () => `/v1/customers/${encodePathSegment(customerId)}`;
  const next = (update: Partial<DraftState>) =>
    customerBuilder(send, customerId, { ...state, ...update });
  const builder: Record<string, unknown> = {
    ...scopeMethods(next),
    email: (email: string) => next({ email }),
    name: (name: string | null) => next({ name }),
    idempotencyKey: (idempotencyKey: string) => next({ idempotencyKey }),
    get: () => send<Customer>(readRequest(path(), state)),
  };
  if (state.email !== undefined || state.name !== undefined) {
    builder.update = () => send<Customer>(writeRequest("PATCH", path(), state, fieldsOf(state)));
  }
  return Object.freeze(builder) as CustomerBuilder<TState>;
}

function fieldsOf(state: CustomerFields): CustomerFields {
  return {
    ...(state.email === undefined ? {} : { email: state.email }),
    ...(state.name === undefined ? {} : { name: state.name }),
  };
}
