import { ErrorCode } from "../constants";
import { BuPaymentError } from "../errors";
import { ConfidentialSecret } from "./secret";

export type Environment = "test" | "live";

export interface ClientConfigInput {
  applicationId: string;
  keyId: string;
  secret: string;
  apiBaseUrl: string;
  environment?: Environment;
}

export interface ClientConfig {
  applicationId: string;
  keyId: string;
  secret: ConfidentialSecret;
  apiBaseUrl: URL;
  environment: Environment;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function parseClientConfig(input: ClientConfigInput): ClientConfig {
  const applicationId = input.applicationId.trim();
  if (!/^app_[A-Za-z0-9_-]+$/u.test(applicationId)) {
    throw invalidConfig("Application ID format is invalid");
  }
  const keyId = input.keyId.trim();
  const environment = keyEnvironment(keyId);
  if (input.environment !== undefined && input.environment !== environment) {
    throw invalidConfig("Key ID and configured environment do not match");
  }
  const secret = ConfidentialSecret.parse(input.secret.trim());
  return {
    applicationId,
    keyId,
    secret,
    apiBaseUrl: parseApiBaseUrl(input.apiBaseUrl),
    environment,
  };
}

function keyEnvironment(keyId: string): Environment {
  const match = /^bup_ck_(test|live)_[A-Za-z0-9_-]+$/u.exec(keyId);
  const environment = match?.[1];
  if (environment !== "test" && environment !== "live") {
    throw invalidConfig("Key ID format is invalid");
  }
  return environment;
}

function parseApiBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    throw invalidConfig("API base URL must be an absolute HTTP or HTTPS URL", cause);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw invalidConfig("API base URL must use HTTP or HTTPS");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw invalidConfig("API base URL must not contain credentials, query, or fragment");
  }
  if (url.protocol === "http:" && !LOOPBACK_HOSTS.has(url.hostname)) {
    throw invalidConfig("API base URL must use HTTPS or loopback HTTP");
  }
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

function invalidConfig(message: string, cause?: unknown): BuPaymentError {
  return new BuPaymentError(message, {
    code: ErrorCode.CONFIGURATION_INVALID,
    ...(cause === undefined ? {} : { cause }),
  });
}
