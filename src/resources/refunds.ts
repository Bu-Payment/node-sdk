import { type PageWithMore, paginate } from "../core/pagination";
import type { CreateRefundBody, ListRefundsQuery, OwnedRefund, Refund } from "../models/refunds";
import { Resource } from "./resource";

export class RefundsResource extends Resource {
  list(query: ListRefundsQuery = {}): Promise<PageWithMore<OwnedRefund>> {
    return this.send({ method: "GET", path: "/v1/refunds", query });
  }

  listAll(query: ListRefundsQuery = {}): AsyncGenerator<OwnedRefund, void, undefined> {
    return paginate((page: ListRefundsQuery) => this.list(page), query);
  }

  get(refundId: string): Promise<OwnedRefund> {
    return this.send({ method: "GET", path: `/v1/refunds/${this.segment(refundId)}` });
  }

  create(body: CreateRefundBody, idempotencyKey?: string): Promise<Refund> {
    return this.send({
      method: "POST",
      path: "/v1/refunds",
      body,
      ...this.replay(idempotencyKey),
    });
  }
}
