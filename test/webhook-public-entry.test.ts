import { describe, expect, it } from "vitest";
import * as sdk from "../src/index";
import { isRejectedDelivery } from "../src/webhooks/handling";
import { webhookDelivery } from "../src/webhooks/verification";

describe("webhook receiving through the package entry", () => {
  it("exports the receiver and the rejected delivery guard", () => {
    expect(sdk.webhookDelivery).toBe(webhookDelivery);
    expect(sdk.isRejectedDelivery).toBe(isRejectedDelivery);
  });
});
