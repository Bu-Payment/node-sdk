import type { CurrentPrice } from "./catalogue/types";
import type { ErrorCode } from "./constants";

export interface BuPaymentErrorOptions<TResource = unknown> {
  code: ErrorCode;
  status?: number;
  requestId?: string;
  cause?: unknown;
  metadata?: Readonly<Record<string, string | number | boolean>>;
  resource?: TResource;
  price?: CurrentPrice;
}

export class BuPaymentError<TResource = unknown> extends Error {
  readonly code: ErrorCode;
  readonly status: number | undefined;
  readonly requestId: string | undefined;
  readonly metadata: Readonly<Record<string, string | number | boolean>> | undefined;
  readonly resource: TResource | undefined;
  readonly price: CurrentPrice | undefined;

  constructor(message: string, options: BuPaymentErrorOptions<TResource>) {
    super(message, { cause: options.cause });
    this.name = "BuPaymentError";
    this.code = options.code;
    this.status = options.status;
    this.requestId = options.requestId;
    this.metadata = options.metadata;
    this.resource = options.resource;
    this.price = options.price;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      ...(this.status === undefined ? {} : { status: this.status }),
      ...(this.requestId === undefined ? {} : { requestId: this.requestId }),
      ...(this.metadata === undefined ? {} : { metadata: this.metadata }),
      ...(this.resource === undefined ? {} : { resource: this.resource }),
      ...(this.price === undefined ? {} : { price: this.price }),
    };
  }
}
