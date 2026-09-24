import { type PageWithMore, paginate } from "../core/pagination";
import type { CreatePaymentBody, ListPaymentsQuery, Payment } from "../models/payments";
import { assertPricingSource } from "./pricing-source";
import { Resource } from "./resource";

export class PaymentsResource extends Resource {
  async create(body: CreatePaymentBody, idempotencyKey?: string): Promise<Payment> {
    assertPricingSource(body);
    return await this.send({
      method: "POST",
      path: "/v1/payments",
      body,
      ...this.replay(idempotencyKey),
    });
  }

  list(query: ListPaymentsQuery = {}): Promise<PageWithMore<Payment>> {
    return this.send({ method: "GET", path: "/v1/payments", query });
  }

  listAll(query: ListPaymentsQuery = {}): AsyncGenerator<Payment, void, undefined> {
    return paginate((page: ListPaymentsQuery) => this.list(page), query);
  }

  get(paymentId: string): Promise<Payment> {
    return this.send({ method: "GET", path: `/v1/payments/${this.segment(paymentId)}` });
  }
}
