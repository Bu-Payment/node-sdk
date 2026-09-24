import {
  type RequestScope,
  readRequest,
  type ScopeMethods,
  type Sender,
  scopeMethods,
} from "../core/builder";
import type { BillingCapabilities } from "./types";

export interface BillingCapabilitiesBuilder extends ScopeMethods<BillingCapabilitiesBuilder> {
  get(): Promise<BillingCapabilities>;
}

export interface BillingClient {
  capabilities(): BillingCapabilitiesBuilder;
}

export function createBillingClient(send: Sender): BillingClient {
  return Object.freeze({
    capabilities: () => billingCapabilities(send, {}),
  });
}

function billingCapabilities(send: Sender, state: RequestScope): BillingCapabilitiesBuilder {
  const next = (update: Partial<RequestScope>) =>
    billingCapabilities(send, { ...state, ...update });
  return Object.freeze({
    ...scopeMethods(next),
    get: () => send<BillingCapabilities>(readRequest("/v1/billing/capabilities", state)),
  });
}
