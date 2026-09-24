export interface Product {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

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
  suggestedProduct: Product;
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
