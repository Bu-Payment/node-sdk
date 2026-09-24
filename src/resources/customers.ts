import { type Page, paginate } from "../core/pagination";
import type {
  CreateCustomerBody,
  Customer,
  ListCustomersQuery,
  UpdateCustomerBody,
} from "../models/customers";
import { Resource } from "./resource";

export class CustomersResource extends Resource {
  list(query: ListCustomersQuery = {}): Promise<Page<Customer>> {
    return this.send({ method: "GET", path: "/v1/customers", query });
  }

  listAll(query: ListCustomersQuery = {}): AsyncGenerator<Customer, void, undefined> {
    return paginate((page: ListCustomersQuery) => this.list(page), query);
  }

  get(customerId: string): Promise<Customer> {
    return this.send({ method: "GET", path: `/v1/customers/${this.segment(customerId)}` });
  }

  create(body: CreateCustomerBody, idempotencyKey?: string): Promise<Customer> {
    return this.send({
      method: "POST",
      path: "/v1/customers",
      body,
      ...this.replay(idempotencyKey),
    });
  }

  update(customerId: string, body: UpdateCustomerBody, idempotencyKey?: string): Promise<Customer> {
    return this.send({
      method: "PATCH",
      path: `/v1/customers/${this.segment(customerId)}`,
      body,
      ...this.replay(idempotencyKey),
    });
  }
}
