import type { BuPaymentError } from "../errors";

export interface Product {
  id: string;
  name: string;
  description: string | null;
  lookupKey: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  defaultPriceId: string | null;
}

export type SuggestedProduct = Omit<Product, "defaultPriceId">;

export type PriceInterval = "day" | "week" | "month" | "year";

export interface PriceRecurrence {
  interval: PriceInterval;
  intervalCount: number;
}

export interface Price {
  id: string;
  productId: string;
  unitAmount: number;
  currency: string;
  type: "one_time" | "recurring";
  recurring: PriceRecurrence | null;
  description: string | null;
  lookupKey: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductCrossSell {
  id: string;
  sourceProductId: string;
  suggestedProductId: string;
  position: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  suggestedProduct: SuggestedProduct;
}

export type EntitlementValueType = "boolean" | "integer" | "string";

export type EntitlementValue = boolean | number | string | null;

export interface ProductEntitlement {
  id: string;
  productId: string;
  featureId: string;
  key: string;
  name: string;
  description: string | null;
  valueType: EntitlementValueType;
  value: EntitlementValue;
  featureActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductEntitlementResolution {
  productId: string;
  entitlements: ProductEntitlement[];
}

export interface ExpectedPrice {
  unitAmount: number;
  currency: string;
}

export interface CurrentPrice {
  id: string;
  unitAmount: number;
  currency: string;
  active: boolean;
  updatedAt: string;
}

export type ProductConflict = BuPaymentError<Product>;

export type PriceConflict = BuPaymentError<Price>;

export type PriceChange =
  | { outcome: "replaced"; replacement: Price; archived: Price; product: Product }
  | { outcome: "default_failed"; replacement: Price; previousPriceId: string; error: unknown }
  | {
      outcome: "archive_failed";
      replacement: Price;
      previousPriceId: string;
      product: Product;
      error: unknown;
    };
