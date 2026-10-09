import { ErrorCode } from "../constants";
import { BuPaymentError } from "../errors";

export type JsonObject = Record<string, unknown>;
export type RejectField = (field: string) => never;

export function isKey<TKey extends string>(
  map: Readonly<Record<TKey, unknown>>,
  key: unknown,
): key is TKey {
  return typeof key === "string" && Object.hasOwn(map, key);
}

export function objectField(value: unknown, field: string, rejectField: RejectField): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return rejectField(field);
  }
  return value as JsonObject;
}

export function requiredTextField(
  source: JsonObject,
  key: string,
  prefix: string,
  rejectField: RejectField,
): string {
  const value = source[key];
  if (typeof value !== "string" || value === "") {
    return rejectField(`${prefix}${key}`);
  }
  return value;
}

export function nullableTextField(
  source: JsonObject,
  key: string,
  prefix: string,
  rejectField: RejectField,
): void {
  if (source[key] !== null && typeof source[key] !== "string") {
    rejectField(`${prefix}${key}`);
  }
}

export function booleanField(
  source: JsonObject,
  key: string,
  prefix: string,
  rejectField: RejectField,
): void {
  if (typeof source[key] !== "boolean") {
    rejectField(`${prefix}${key}`);
  }
}

export function integerField(
  source: JsonObject,
  key: string,
  minimum: number,
  prefix: string,
  rejectField: RejectField,
): void {
  const value = source[key];
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    rejectField(`${prefix}${key}`);
  }
}

export function timestampField(
  source: JsonObject,
  key: string,
  prefix: string,
  rejectField: RejectField,
): string {
  const value = requiredTextField(source, key, prefix, rejectField);
  const time = Date.parse(value);
  if (Number.isNaN(time) || new Date(time).toISOString() !== value) {
    rejectField(`${prefix}${key}`);
  }
  return value;
}

export function fieldRejecter(payload: JsonObject): RejectField {
  const context = {
    ...(typeof payload.id === "string" ? { eventId: payload.id } : {}),
    ...(typeof payload.type === "string" ? { eventType: payload.type } : {}),
  };
  return (field: string) => {
    throw new BuPaymentError(`Webhook event field ${field} does not match its documented shape`, {
      code: ErrorCode.WEBHOOK_EVENT_INVALID,
      metadata: { ...context, field },
    });
  };
}

export function nullableIntegerField(
  source: JsonObject,
  key: string,
  minimum: number,
  prefix: string,
  rejectField: RejectField,
): void {
  if (source[key] !== null) {
    integerField(source, key, minimum, prefix, rejectField);
  }
}
