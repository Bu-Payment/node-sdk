import type { createCatalogueClient } from "../src/catalogue/client";
import type { PriceTerms } from "../src/catalogue/price-terms";
import type { Price, Product } from "../src/catalogue/types";
import type { createCheckoutClient } from "../src/checkout/client";

declare const catalogue: ReturnType<typeof createCatalogueClient>;
declare const checkout: ReturnType<typeof createCheckoutClient>;

const products: Promise<Product[]> = catalogue.products().active(false).collect();
const prices: Promise<Price[]> = catalogue.prices().productId("prod_1").collect();

const product: Promise<Product | null> = catalogue.product("prod_1").find();
const price: Promise<Price | null> = catalogue.price("price_1").find();
// @ts-expect-error a product that may be absent is not a product
const assumed: Promise<Product> = catalogue.product("prod_1").find();

// @ts-expect-error the shipping rates cannot be read before the quote is complete
checkout.shippingRates().currency("EUR").destinationCountry("PT").collect();

declare const terms: PriceTerms;
// @ts-expect-error price terms are read from a price, never edited
terms.currency = "USD";

void [products, prices, product, price, assumed];
