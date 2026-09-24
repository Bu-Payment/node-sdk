import { ErrorCode } from "../constants";
import { BuPaymentError } from "../errors";

const SECRET_PREFIX = "bup_sec_";
const KEY_LENGTH_BYTES = 32;
const REDACTED = "[redacted]";

export class ConfidentialSecret {
  readonly #keyBytes: Uint8Array;

  private constructor(keyBytes: Uint8Array) {
    this.#keyBytes = keyBytes;
  }

  static parse(value: string): ConfidentialSecret {
    if (!value.startsWith(SECRET_PREFIX)) {
      throw invalidSecret("Confidential secret must start with bup_sec_");
    }
    const suffix = value.slice(SECRET_PREFIX.length);
    if (!/^[A-Za-z0-9_-]+$/u.test(suffix)) {
      throw invalidSecret("Confidential secret suffix must be unpadded Base64URL");
    }
    const decoded = new Uint8Array(Buffer.from(suffix, "base64url"));
    if (Buffer.from(decoded).toString("base64url") !== suffix) {
      throw invalidSecret("Confidential secret suffix is not canonical Base64URL");
    }
    if (decoded.byteLength !== KEY_LENGTH_BYTES) {
      throw invalidSecret("Confidential secret must decode to exactly 32 bytes");
    }
    return new ConfidentialSecret(decoded);
  }

  keyBytes(): Uint8Array {
    return this.#keyBytes.slice();
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return `ConfidentialSecret ${REDACTED}`;
  }
}

function invalidSecret(message: string): BuPaymentError {
  return new BuPaymentError(message, { code: ErrorCode.CONFIGURATION_INVALID });
}
