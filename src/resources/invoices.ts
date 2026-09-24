import { type PageWithMore, paginate } from "../core/pagination";
import type { Invoice, ListInvoicesQuery } from "../models/invoices";
import { Resource } from "./resource";

export class InvoicesResource extends Resource {
  list(query: ListInvoicesQuery = {}): Promise<PageWithMore<Invoice>> {
    return this.send({ method: "GET", path: "/v1/invoices", query });
  }

  listAll(query: ListInvoicesQuery = {}): AsyncGenerator<Invoice, void, undefined> {
    return paginate((page: ListInvoicesQuery) => this.list(page), query);
  }

  get(invoiceId: string): Promise<Invoice> {
    return this.send({ method: "GET", path: `/v1/invoices/${this.segment(invoiceId)}` });
  }
}
