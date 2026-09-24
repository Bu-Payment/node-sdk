import type { Collection } from "../core/pagination";
import type {
  CalculateTaxBody,
  ListApplicableTaxRatesQuery,
  TaxCalculation,
  TaxRate,
} from "../models/checkout";
import { Resource } from "./resource";

export class TaxRatesResource extends Resource {
  list(query: ListApplicableTaxRatesQuery): Promise<Collection<TaxRate>> {
    return this.send({ method: "GET", path: "/v1/tax-rates", query });
  }

  calculate(
    taxRateId: string,
    body: CalculateTaxBody,
    idempotencyKey?: string,
  ): Promise<TaxCalculation> {
    return this.send({
      method: "POST",
      path: `/v1/tax-rates/${this.segment(taxRateId)}/calculate`,
      body,
      ...this.replay(idempotencyKey),
    });
  }
}
