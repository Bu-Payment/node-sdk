import { ErrorCode, Header } from "../constants";
import { BuPaymentError } from "../errors";

const SERVER_ERROR_CODES = new Set<string>(Object.values(ErrorCode));

const RESOURCE_BEARING_CODES = new Set<ErrorCode>([
  ErrorCode.STALE_RESOURCE,
  ErrorCode.LOOKUP_KEY_CONFLICT,
]);

const STATUS_ERROR_CODES: ReadonlyMap<number, ErrorCode> = new Map([
  [400, ErrorCode.REQUEST_INVALID],
  [404, ErrorCode.RESOURCE_NOT_FOUND],
  [409, ErrorCode.RESOURCE_CONFLICT],
  [429, ErrorCode.TOO_MANY_REQUESTS],
]);

export async function readResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw responseFailure(response, text);
  }
  if (text === "") {
    return undefined as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch (cause) {
    throw new BuPaymentError("API response is not valid JSON", {
      code: ErrorCode.RESPONSE_INVALID,
      status: response.status,
      cause,
      ...requestIdOf(response, undefined),
    });
  }
}

function responseFailure(response: Response, text: string): BuPaymentError {
  const envelope = parseEnvelope(text);
  const serverCode = typeof envelope?.error === "string" ? envelope.error : undefined;
  const code = resolveErrorCode(serverCode, response.status);
  const retryAfter = response.headers.get(Header.RETRY_AFTER);
  const metadata: Record<string, string | number | boolean> = {};
  if (serverCode !== undefined && serverCode !== code) {
    metadata.apiError = serverCode;
  }
  if (retryAfter !== null) {
    metadata.retryAfter = retryAfter;
  }
  const resource = RESOURCE_BEARING_CODES.has(code) ? resourceOf(envelope) : undefined;
  return new BuPaymentError(messageOf(envelope, code), {
    code,
    status: response.status,
    ...requestIdOf(response, envelope),
    ...(Object.keys(metadata).length === 0 ? {} : { metadata }),
    ...(resource === undefined ? {} : { resource }),
  });
}

function resourceOf(
  envelope: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const resource = envelope?.resource;
  if (typeof resource !== "object" || resource === null || Array.isArray(resource)) {
    return undefined;
  }
  const { id, updatedAt } = resource as Record<string, unknown>;
  return typeof id === "string" && typeof updatedAt === "string"
    ? (resource as Record<string, unknown>)
    : undefined;
}

function resolveErrorCode(serverCode: string | undefined, status: number): ErrorCode {
  if (serverCode !== undefined && SERVER_ERROR_CODES.has(serverCode)) {
    return serverCode as ErrorCode;
  }
  return STATUS_ERROR_CODES.get(status) ?? ErrorCode.OPERATION_FAILED;
}

function parseEnvelope(text: string): Record<string, unknown> | undefined {
  if (text === "") {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function messageOf(envelope: Record<string, unknown> | undefined, code: ErrorCode): string {
  const message = envelope?.message;
  if (typeof message === "string" && message !== "") {
    return message;
  }
  if (Array.isArray(message) && typeof message[0] === "string") {
    return message.join(", ");
  }
  return `The BuPayment API rejected the request with ${code}`;
}

function requestIdOf(
  response: Response,
  envelope: Record<string, unknown> | undefined,
): { requestId?: string } {
  const fromBody = envelope?.requestId;
  const requestId =
    typeof fromBody === "string"
      ? fromBody
      : (response.headers.get(Header.REQUEST_ID) ?? undefined);
  return requestId === undefined ? {} : { requestId };
}
