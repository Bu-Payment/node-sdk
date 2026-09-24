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
} from "../core/builder";
import type { PageWithMore } from "../core/pagination";
import { encodePathSegment } from "../core/request-target";
import type { Invoice, InvoiceStatus } from "./types";

interface InvoiceListState extends CursorScope {
  customerId?: string;
  subscriptionId?: string;
  status?: InvoiceStatus;
  number?: string;
}

export interface InvoiceListBuilder
  extends PageMethods<InvoiceListBuilder, Invoice, PageWithMore<Invoice>> {
  customerId(customerId: string): InvoiceListBuilder;
  subscriptionId(subscriptionId: string): InvoiceListBuilder;
  status(status: InvoiceStatus): InvoiceListBuilder;
  number(number: string): InvoiceListBuilder;
}

export interface InvoiceBuilder extends ScopeMethods<InvoiceBuilder> {
  get(): Promise<Invoice>;
}

export interface InvoicesClient {
  list(): InvoiceListBuilder;
  invoice(invoiceId: string): InvoiceBuilder;
}

export function createInvoicesClient(send: Sender): InvoicesClient {
  return Object.freeze({
    list: () => invoiceList(send, {}),
    invoice: (invoiceId: string) => singleInvoice(send, invoiceId, {}),
  });
}

function invoiceList(send: Sender, state: InvoiceListState): InvoiceListBuilder {
  const next = (update: Partial<InvoiceListState>) => invoiceList(send, { ...state, ...update });
  const read = (page: InvoiceListState) =>
    send<PageWithMore<Invoice>>(
      readRequest(
        "/v1/invoices",
        page,
        pageQuery(page, {
          ...(page.customerId === undefined ? {} : { customerId: page.customerId }),
          ...(page.subscriptionId === undefined ? {} : { subscriptionId: page.subscriptionId }),
          ...(page.status === undefined ? {} : { status: page.status }),
          ...(page.number === undefined ? {} : { number: page.number }),
        }),
      ),
    );
  return Object.freeze({
    ...pageMethods(state, next, read),
    customerId: (customerId: string) => next({ customerId }),
    subscriptionId: (subscriptionId: string) => next({ subscriptionId }),
    status: (status: InvoiceStatus) => next({ status }),
    number: (number: string) => next({ number }),
  });
}

function singleInvoice(send: Sender, invoiceId: string, state: RequestScope): InvoiceBuilder {
  const next = (update: Partial<RequestScope>) =>
    singleInvoice(send, invoiceId, { ...state, ...update });
  return Object.freeze({
    ...scopeMethods(next),
    get: () => send<Invoice>(readRequest(`/v1/invoices/${encodePathSegment(invoiceId)}`, state)),
  });
}
