import type { ErrorCode } from "./constants";

export interface BuPaymentErrorOptions {
  code: ErrorCode;
  status?: number;
  requestId?: string;
  cause?: unknown;
  metadata?: Readonly<Record<string, string | number | boolean>>;
}

export class BuPaymentError extends Error {
  readonly code: ErrorCode;
  readonly status: number | undefined;
  readonly requestId: string | undefined;
  readonly metadata: Readonly<Record<string, string | number | boolean>> | undefined;

  constructor(message: string, options: BuPaymentErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "BuPaymentError";
    this.code = options.code;
    this.status = options.status;
    this.requestId = options.requestId;
    this.metadata = options.metadata;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      ...(this.status === undefined ? {} : { status: this.status }),
      ...(this.requestId === undefined ? {} : { requestId: this.requestId }),
      ...(this.metadata === undefined ? {} : { metadata: this.metadata }),
    };
  }
}
