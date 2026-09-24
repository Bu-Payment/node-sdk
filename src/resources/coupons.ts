import type {
  CouponEvaluation,
  CouponRedemption,
  EvaluateCouponBody,
  RedeemCouponBody,
} from "../models/checkout";
import { Resource } from "./resource";

export class CouponsResource extends Resource {
  evaluate(body: EvaluateCouponBody): Promise<CouponEvaluation> {
    return this.send({ method: "POST", path: "/v1/coupons/evaluate", body });
  }

  redeem(body: RedeemCouponBody, idempotencyKey?: string): Promise<CouponRedemption> {
    return this.send({
      method: "POST",
      path: "/v1/coupons/redeem",
      body,
      ...this.replay(idempotencyKey),
    });
  }
}
