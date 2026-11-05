export type Stamp = string | { readonly updatedAt: string };

export function isStale(candidate: Stamp, stored: Stamp): boolean {
  const candidateTime = Date.parse(stampOf(candidate));
  return Number.isNaN(candidateTime) || candidateTime < Date.parse(stampOf(stored));
}

function stampOf(stamp: Stamp): string {
  return typeof stamp === "string" ? stamp : stamp.updatedAt;
}
