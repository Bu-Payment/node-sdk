import type { createCatalogueClient } from "../src/catalogue/client";
import type { ProductMirrorChange, ProductMirrorOutcome, ProductMirrorResult } from "../src/index";
import type { ProductMirrorResult as ProductMirrorResultFromTypes } from "../src/types";

declare const catalogue: ReturnType<typeof createCatalogueClient>;

const ensured: Promise<ProductMirrorResult> = catalogue
  .productMirror("sku-1")
  .knownId("prod_1")
  .name("Gold")
  .active(true)
  .defaultUnitAmount(100)
  .defaultCurrency("EUR")
  .idempotencyKey("mirror-sku-1")
  .signal(new AbortController().signal)
  .timeoutMs(5_000)
  .ensure();

const keyedFirst: Promise<ProductMirrorResultFromTypes> = catalogue
  .productMirror("sku-1")
  .idempotencyKey("mirror-sku-1")
  .name("Gold")
  .ensure();

// @ts-expect-error a mirror is ensured only once it carries a name
catalogue.productMirror("sku-1").idempotencyKey("mirror-sku-1").ensure();

// @ts-expect-error a mirror writes under keys derived from the caller's, so the key is required
catalogue.productMirror("sku-1").name("Gold").ensure();

// @ts-expect-error the default currency is set only after the default amount
catalogue.productMirror("sku-1").defaultCurrency("EUR");

// @ts-expect-error a default amount without its currency is not a default price
catalogue.productMirror("sku-1").name("Gold").idempotencyKey("k").defaultUnitAmount(100).ensure();

const unnamed = catalogue.productMirror("sku-1").idempotencyKey("mirror-sku-1");
const named = unnamed.name("Gold");
// @ts-expect-error the terminal is omitted, not typed never, until the mirror carries a name
void unnamed.ensure;
// @ts-expect-error the default currency is omitted, not typed never, before the default amount
void named.defaultCurrency;
// @ts-expect-error naming returns a new builder and leaves the earlier one without the terminal
unnamed.ensure();
const namedEnsured: Promise<ProductMirrorResult> = named.ensure();

declare const result: ProductMirrorResult;
const outcome: ProductMirrorOutcome = result.outcome;
const changes: ProductMirrorChange[] = result.changes;
// @ts-expect-error the outcome names only how the product was reached
const updated: ProductMirrorOutcome = "updated";

void [ensured, keyedFirst, namedEnsured, outcome, changes, updated];
