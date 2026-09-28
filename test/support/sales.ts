import type { SaleReservation } from "../../src/sales/types";
import { type Call, harnessOf, harnessStalling, json, pathOf } from "./harness";

export const email = "buyer@example.test";
export const displayed = { unitAmount: 1_500, currency: "EUR" };
export const current = {
  id: "price_1",
  unitAmount: 1_900,
  currency: "EUR",
  active: true,
  updatedAt: "2026-09-26T12:00:00.000Z",
};
export const priceChanged = {
  error: "price_changed",
  message: "changed",
  price: current,
  statusCode: 409,
};
export const upstreamDown = { error: "operation_failed", message: "down", statusCode: 503 };
export const notFound = { error: "resource_not_found", message: "missing", statusCode: 404 };
export const emailTaken = {
  error: "app_customer_email_conflict",
  message: "taken",
  statusCode: 409,
};

export const routeOf = (call: Call) => `${call.method} ${pathOf(call)}`;

export interface ShopOptions {
  existing?: boolean;
  lookup?: (attempt: number) => Response;
  signUp?: () => Response;
  payment?: () => Response;
}

export function shop(options: ShopOptions = {}) {
  let lookups = 0;
  return harnessOf((call) => {
    const route = routeOf(call);
    if (route === "GET /v1/customers") {
      lookups += 1;
      const customers = options.existing === false ? [] : [{ id: "cus_1", email }];
      return options.lookup?.(lookups) ?? json({ data: customers, nextCursor: null });
    }
    if (route === "POST /v1/customers") {
      return options.signUp?.() ?? json({ id: "cus_new", email });
    }
    return options.payment?.() ?? json({ id: "pay_1", status: "succeeded" });
  });
}

export function stallingAt(stalled: string, onStall: () => void) {
  return harnessStalling((call) => {
    const route = routeOf(call);
    if (route === stalled) {
      onStall();
      return undefined;
    }
    if (route === "GET /v1/customers") {
      return json({ data: [], nextCursor: null });
    }
    return json({ id: "cus_new", email });
  });
}

export function ledger(calls: Call[], available: boolean | Promise<boolean> = true) {
  const events: string[] = [];
  const reservation: SaleReservation = {
    reserve: () => {
      events.push(`reserve@${calls.length}`);
      return available;
    },
    release: () => {
      events.push(`release@${calls.length}`);
    },
  };
  return { events, reservation };
}

export type SalesClientOf = ReturnType<typeof shop>["client"];

export const saleOf = (client: SalesClientOf) =>
  client.sales
    .draft()
    .priceId("price_1")
    .displayedPrice(displayed)
    .customerEmail(email)
    .idempotencyKey("order-1");

export async function failureOf(pending: Promise<unknown>): Promise<unknown> {
  return await pending.then(
    () => undefined,
    (error: unknown) => error,
  );
}
