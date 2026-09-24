import { ErrorCode, Header, SIGNATURE_VERSION } from "../constants";
import { BuPaymentError } from "../errors";
import { buildCanonicalRequest } from "./canonical-request";
import type { ClientConfig } from "./config";
import { generateNonce } from "./nonce";
import { buildRequestTarget, type QueryInput } from "./request-target";
import { readResponse } from "./response";
import { assertNoScopeOverrides } from "./scope-guard";
import { signCanonicalRequest } from "./signature";

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface TransportOptions {
  fetch?: FetchLike;
  now?: () => number;
  nonce?: () => string;
  timeoutMs?: number;
}

export interface TransportRequest {
  method: string;
  path: string;
  query?: QueryInput;
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

export class SignedTransport {
  readonly #config: ClientConfig;
  readonly #fetch: FetchLike;
  readonly #now: () => number;
  readonly #nonce: () => string;
  readonly #timeoutMs: number;

  constructor(config: ClientConfig, options: TransportOptions = {}) {
    this.#config = config;
    this.#fetch = options.fetch ?? ((input, init) => fetch(input, init));
    this.#now = options.now ?? Date.now;
    this.#nonce = options.nonce ?? generateNonce;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async send<T>(request: TransportRequest): Promise<T> {
    assertNoScopeOverrides(request.query);
    const target = buildRequestTarget(this.#config.apiBaseUrl, request.path, request.query);
    const body = request.body === undefined ? undefined : encodeBody(request.body);
    const response = await this.#fetchSigned(request, target.url, {
      rawPath: target.rawPath,
      rawQuery: target.rawQuery,
      body,
    });
    return await readResponse<T>(response);
  }

  async #fetchSigned(
    request: TransportRequest,
    url: string,
    signed: { rawPath: string; rawQuery: string; body: Uint8Array | undefined },
  ): Promise<Response> {
    const timestamp = Math.floor(this.#now() / 1000).toString();
    const nonce = this.#nonce();
    const canonicalRequest = buildCanonicalRequest({
      applicationId: this.#config.applicationId,
      keyId: this.#config.keyId,
      timestamp,
      nonce,
      method: request.method,
      rawPath: signed.rawPath,
      ...(signed.rawQuery === "" ? {} : { rawQuery: signed.rawQuery }),
      ...(signed.body === undefined ? {} : { body: signed.body }),
    });
    const headers: Record<string, string> = {
      accept: "application/json",
      [Header.SIGNATURE_VERSION]: SIGNATURE_VERSION,
      [Header.APP_ID]: this.#config.applicationId,
      [Header.KEY_ID]: this.#config.keyId,
      [Header.TIMESTAMP]: timestamp,
      [Header.NONCE]: nonce,
      [Header.SIGNATURE]: signCanonicalRequest(this.#config.secret, canonicalRequest),
    };
    if (signed.body !== undefined) {
      headers["content-type"] = JSON_CONTENT_TYPE;
    }
    if (request.idempotencyKey !== undefined) {
      headers[Header.IDEMPOTENCY_KEY] = request.idempotencyKey;
    }
    return await this.#dispatch(request, url, headers, signed.body);
  }

  async #dispatch(
    request: TransportRequest,
    url: string,
    headers: Record<string, string>,
    body: Uint8Array | undefined,
  ): Promise<Response> {
    const timeoutMs = request.timeoutMs ?? this.#timeoutMs;
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    request.signal?.addEventListener("abort", abortFromCaller, { once: true });
    if (request.signal?.aborted) {
      controller.abort();
    }
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      return await this.#fetch(url, {
        method: request.method.toUpperCase(),
        headers,
        ...(body === undefined ? {} : { body }),
        signal: controller.signal,
      });
    } catch (cause) {
      throw transportFailure(cause, {
        cancelled: request.signal?.aborted === true,
        timedOut,
        timeoutMs,
      });
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", abortFromCaller);
    }
  }
}

function encodeBody(body: unknown): Uint8Array {
  const json = JSON.stringify(body) ?? "null";
  assertNoScopeOverrides(JSON.parse(json) as unknown);
  return new Uint8Array(Buffer.from(json, "utf8"));
}

function transportFailure(
  cause: unknown,
  state: { cancelled: boolean; timedOut: boolean; timeoutMs: number },
): BuPaymentError {
  if (state.cancelled) {
    return new BuPaymentError("The request was cancelled by the caller", {
      code: ErrorCode.REQUEST_CANCELLED,
      cause,
    });
  }
  if (state.timedOut) {
    return new BuPaymentError("The request timed out before the API responded", {
      code: ErrorCode.NETWORK_UNAVAILABLE,
      cause,
      metadata: { timeoutMs: state.timeoutMs },
    });
  }
  return new BuPaymentError("The BuPayment API could not be reached", {
    code: ErrorCode.NETWORK_UNAVAILABLE,
    cause,
  });
}
