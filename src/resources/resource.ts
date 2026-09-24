import type { TransportRequest } from "../core/http";
import { encodePathSegment } from "../core/request-target";

export type RequestSender = <T>(request: TransportRequest) => Promise<T>;

export abstract class Resource {
  readonly #send: RequestSender;

  constructor(send: RequestSender) {
    this.#send = send;
  }

  protected send<T>(request: TransportRequest): Promise<T> {
    return this.#send<T>(request);
  }

  protected segment(value: string): string {
    return encodePathSegment(value);
  }

  protected replay(idempotencyKey: string | undefined): { idempotencyKey?: string } {
    return idempotencyKey === undefined ? {} : { idempotencyKey };
  }
}
