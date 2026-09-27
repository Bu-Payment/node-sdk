import { encodePathSegment } from "../core/request-target";

export function productPath(productId: string): string {
  return `/v1/products/${encodePathSegment(productId)}`;
}

export function pricePath(priceId: string): string {
  return `/v1/prices/${encodePathSegment(priceId)}`;
}
