import { EnvVariable, ErrorCode } from "../constants";
import { BuPaymentError } from "../errors";
import type { ClientConfigInput } from "./config";

export type BuPaymentEnv = Readonly<Record<string, string | undefined>>;

const REQUIRED_VARIABLES = [
  EnvVariable.API_URL,
  EnvVariable.APP_ID,
  EnvVariable.KEY_ID,
  EnvVariable.SECRET,
] as const;

export function isConfigured(env: BuPaymentEnv = process.env): boolean {
  return missingVariables(env).length === 0;
}

export function clientConfigFromEnv(env: BuPaymentEnv): ClientConfigInput {
  const apiBaseUrl = settingOf(env, EnvVariable.API_URL);
  const applicationId = settingOf(env, EnvVariable.APP_ID);
  const keyId = settingOf(env, EnvVariable.KEY_ID);
  const secret = settingOf(env, EnvVariable.SECRET);
  if (!apiBaseUrl || !applicationId || !keyId || !secret) {
    const missing = missingVariables(env);
    throw configurationMissing(
      `Missing required environment variables: ${missing.join(", ")}`,
      missing,
    );
  }
  const webhookSecret = settingOf(env, EnvVariable.WEBHOOK_SECRET);
  const destinationKey = settingOf(env, EnvVariable.DESTINATION_KEY);
  return {
    apiBaseUrl,
    applicationId,
    keyId,
    secret,
    ...(webhookSecret === undefined ? {} : { webhookSecret }),
    ...(destinationKey === undefined ? {} : { destinationKey }),
  };
}

export function configurationMissing(
  message: string,
  variables: readonly EnvVariable[],
): BuPaymentError {
  return new BuPaymentError(message, {
    code: ErrorCode.CONFIGURATION_MISSING,
    metadata: { variables: variables.join(",") },
  });
}

function missingVariables(env: BuPaymentEnv): EnvVariable[] {
  return REQUIRED_VARIABLES.filter((name) => settingOf(env, name) === undefined);
}

function settingOf(env: BuPaymentEnv, name: EnvVariable): string | undefined {
  const value = env[name]?.trim();
  return value === undefined || value === "" ? undefined : value;
}
