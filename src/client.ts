import { type ClientConfig, type ClientConfigInput, parseClientConfig } from "./core/config";
import { SignedTransport, type TransportOptions, type TransportRequest } from "./core/http";
import { generateIdempotencyKey, parseIdempotencyKey } from "./core/idempotency";

export type ClientOptions = TransportOptions;

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export class BuPaymentClient {
  readonly #config: ClientConfig;
  readonly #transport: SignedTransport;

  constructor(input: ClientConfigInput, options: ClientOptions = {}) {
    this.#config = parseClientConfig(input);
    this.#transport = new SignedTransport(this.#config, options);
  }

  get applicationId(): string {
    return this.#config.applicationId;
  }

  get environment(): ClientConfig["environment"] {
    return this.#config.environment;
  }

  async request<T>(request: TransportRequest): Promise<T> {
    return await this.#transport.send<T>(withIdempotencyKey(request));
  }
}

function withIdempotencyKey(request: TransportRequest): TransportRequest {
  if (request.idempotencyKey !== undefined) {
    return { ...request, idempotencyKey: parseIdempotencyKey(request.idempotencyKey) };
  }
  if (!MUTATING_METHODS.has(request.method.toUpperCase())) {
    return request;
  }
  return { ...request, idempotencyKey: generateIdempotencyKey() };
}
