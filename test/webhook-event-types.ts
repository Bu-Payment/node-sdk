declare const verifiedEvent: import("../src/webhooks/types").WebhookEvent;

type NotAny<TValue> = 0 extends 1 & TValue ? never : unknown;

function exactly<TExpected>() {
  return <TActual extends TExpected>(
    _value: TActual & ([TExpected] extends [TActual] ? NotAny<TActual> : never),
  ) => undefined;
}

type EventProduct = import("../src/webhooks/types").CatalogueEventProduct;
type CatalogueProduct = import("../src/catalogue/types").Product;
type CataloguePrice = import("../src/catalogue/types").Price;

switch (verifiedEvent.type) {
  case "catalogue.product.default_price.updated.v1":
    exactly<EventProduct>()(verifiedEvent.data.resource);
    exactly<string | null>()(verifiedEvent.data.resource.defaultPriceId);
    exactly<"product">()(verifiedEvent.data.resourceType);
    break;
  case "catalogue.price.assigned.v1":
    exactly<CataloguePrice>()(verifiedEvent.data.resource);
    // @ts-expect-error a price carries no default price
    verifiedEvent.data.resource.defaultPriceId;
    break;
  case "unknown":
    exactly<unknown>()(verifiedEvent.data);
    exactly<string>()(verifiedEvent.receivedType);
    break;
  case "catalogue.product.unassigned.v1":
    // @ts-expect-error the event product is wider than the catalogue product
    exactly<CatalogueProduct>()(verifiedEvent.data.resource);
    break;
  default:
    exactly<EventProduct | CataloguePrice>()(verifiedEvent.data.resource);
}

// @ts-expect-error a value typed any never passes as the exact type
exactly<string>()(JSON.parse("1"));

// @ts-expect-error an unknown event has no typed resource to read
verifiedEvent.type === "unknown" && verifiedEvent.data.resource;

// @ts-expect-error only documented types can be compared, so a typo does not narrow silently
verifiedEvent.type === "catalogue.product.create.v1";

export {};
