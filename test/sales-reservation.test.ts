import { describe, expect, it } from "vitest";
import { ErrorCode } from "../src/constants";
import type { BuPaymentError } from "../src/errors";
import type { SaleReservation } from "../src/sales/types";
import { json } from "./support/harness";
import {
  failureOf,
  ledger,
  notFound,
  outcomeUnknown,
  preparationFailed,
  priceChanged,
  type ShopOptions,
  saleOf,
  shop,
  upstreamDown,
} from "./support/sales";

describe("sales with a stock reservation", () => {
  it("reserves before any request and keeps the unit once paid", async () => {
    const { client, calls } = shop();
    const { events, reservation } = ledger(calls);
    const sale = await saleOf(client).reservation(reservation).charge();
    expect(sale.outcome).toBe("paid");
    expect(events).toEqual(["reserve@0"]);
  });

  it("answers unavailable without a request when nothing is reserved", async () => {
    const { client, calls } = shop();
    const { events, reservation } = ledger(calls, Promise.resolve(false));
    expect(await saleOf(client).reservation(reservation).charge()).toEqual({
      outcome: "unavailable",
    });
    expect(calls).toHaveLength(0);
    expect(events).toEqual(["reserve@0"]);
  });

  it.each<[string, ShopOptions, string]>([
    ["the price changed", { payment: () => json(priceChanged, 409) }, "price_changed"],
    [
      "the payment did not succeed",
      { payment: () => json({ id: "pay_1", status: "failed" }) },
      "unpaid",
    ],
  ])("releases the unit once when %s", async (_label, options, outcome) => {
    const { client, calls } = shop(options);
    const { events, reservation } = ledger(calls);
    const sale = await saleOf(client).reservation(reservation).charge();
    expect(sale.outcome).toBe(outcome);
    expect(events).toEqual(["reserve@0", "release@2"]);
  });

  it.each<[string, ShopOptions, string, number]>([
    [
      "the API refuses the payment",
      { payment: () => json(notFound, 404) },
      "resource_not_found",
      2,
    ],
    [
      "the customer lookup fails",
      { lookup: () => json(upstreamDown, 503) },
      ErrorCode.OPERATION_FAILED,
      1,
    ],
    [
      "the customer creation fails",
      { existing: false, signUp: () => json(upstreamDown, 503) },
      ErrorCode.OPERATION_FAILED,
      2,
    ],
  ])("releases the unit once and rethrows when %s", async (_label, options, code, released) => {
    const { client, calls } = shop(options);
    const { events, reservation } = ledger(calls);
    const failure = await failureOf(saleOf(client).reservation(reservation).charge());
    expect((failure as BuPaymentError).code).toBe(code);
    expect(events).toEqual(["reserve@0", `release@${released}`]);
  });

  it("releases the unit when the payment is refused before it is sent", async () => {
    const { client, calls } = shop();
    const { events, reservation } = ledger(calls);
    const sale = saleOf(client).idempotencyKey(" order-1 ").reservation(reservation);
    const failure = await failureOf(sale.charge());
    expect((failure as BuPaymentError).code).toBe(ErrorCode.REQUEST_INVALID);
    expect((failure as BuPaymentError).status).toBeUndefined();
    expect(events).toEqual(["reserve@0", "release@1"]);
  });

  it.each<[string, ShopOptions, string]>([
    ["the server fails", { payment: () => json(upstreamDown, 503) }, "unconfirmed"],
    [
      "the API lost the outcome",
      { payment: () => json(outcomeUnknown, 409) },
      "needs_reconciliation",
    ],
  ])("keeps the unit when %s", async (_label, options, outcome) => {
    const { client, calls } = shop(options);
    const { events, reservation } = ledger(calls);
    const sale = await saleOf(client).reservation(reservation).charge();
    expect(sale.outcome).toBe(outcome);
    expect(events).toEqual(["reserve@0"]);
  });

  it("releases the unit when the API failed to prepare the payment", async () => {
    const { client, calls } = shop({ payment: () => json(preparationFailed, 500) });
    const { events, reservation } = ledger(calls);
    await failureOf(saleOf(client).reservation(reservation).charge());
    expect(events).toEqual(["reserve@0", "release@2"]);
  });

  it.each<[string, ShopOptions]>([
    ["the sale ends unpaid", { payment: () => json({ id: "pay_1", status: "failed" }) }],
    ["the sale is refused", { payment: () => json(notFound, 404) }],
  ])("lets a failing release surface when %s", async (_label, options) => {
    const { client } = shop(options);
    const reservation: SaleReservation = {
      reserve: async () => true,
      release: async () => {
        throw new Error("ledger unavailable");
      },
    };
    await expect(saleOf(client).reservation(reservation).charge()).rejects.toThrow(
      "ledger unavailable",
    );
  });

  it("keeps the hooks it was given when the caller later swaps them", async () => {
    const { client, calls } = shop({ payment: () => json({ id: "pay_1", status: "failed" }) });
    const { events, reservation } = ledger(calls);
    const sale = saleOf(client).reservation(reservation);
    reservation.reserve = () => {
      events.push("swapped reserve");
      return true;
    };
    reservation.release = () => {
      events.push("swapped release");
    };
    await sale.charge();
    expect(events).toEqual(["reserve@0", "release@2"]);
  });

  it("calls the hooks on the object that owns them", async () => {
    class StockHold implements SaleReservation {
      readonly events: string[] = [];
      reserve() {
        this.events.push("reserve");
        return true;
      }
      release() {
        this.events.push("release");
      }
    }
    const { client } = shop({ payment: () => json({ id: "pay_1", status: "failed" }) });
    const hold = new StockHold();
    await saleOf(client).reservation(hold).charge();
    expect(hold.events).toEqual(["reserve", "release"]);
  });
});
