import type { ErrorCode } from "./constants";

export interface BuPaymentErrorOptions<TResource = unknown> {
  code: ErrorCode;
  status?: number;
  requestId?: string;
  cause?: unknown;
  metadata?: Readonly<Record<string, string | number | boolean>>;
  resource?: TResource;
}

export class BuPaymentError<TResource = unknown> extends Error {
  readonly code: ErrorCode;
  readonly status: number | undefined;
  readonly requestId: string | undefined;
  readonly metadata: Readonly<Record<string, string | number | boolean>> | undefined;
  readonly resource: TResource | undefined;

  constructor(message: string, options: BuPaymentErrorOptions<TResource>) {
    super(message, { cause: options.cause });
    this.name = "BuPaymentError";
    this.code = options.code;
    this.status = options.status;
    this.requestId = options.requestId;
    this.metadata = options.metadata;
    this.resource = options.resource;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      ...(this.status === undefined ? {} : { status: this.status }),
      ...(this.requestId === undefined ? {} : { requestId: this.requestId }),
      ...(this.metadata === undefined ? {} : { metadata: this.metadata }),
      ...(this.resource === undefined ? {} : { resource: this.resource }),
    };
  }
}
