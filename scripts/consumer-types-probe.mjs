export function typesCheck() {
  return `import { createBuPaymentClient, ErrorCode, paginate, verifyWebhookDelivery } from "@bu-payment/node-sdk";
import type {
  BillingCapabilities,
  ClientConfigInput,
  OwnedRefund,
  PaymentMethodSetup,
  Page,
  Product,
  Refund,
  TransportRequest,
  VerifiedWebhookDelivery,
} from "@bu-payment/node-sdk/types";

const input: ClientConfigInput = {
  applicationId: "app_123",
  keyId: "bup_ck_test_A12345678901234567890123",
  secret: "bup_sec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
  apiBaseUrl: "https://api.bupayment.test",
};

const request: TransportRequest = { method: "GET", path: "/v1/products" };

export async function probe(): Promise<unknown> {
  const client = createBuPaymentClient(input);
  const code: typeof ErrorCode.RESOURCE_NOT_FOUND = ErrorCode.RESOURCE_NOT_FOUND;
  void code;

  const page = await client.catalogue.products().active(true).limit(20).get();
  const name: string = page.data[0]?.name ?? "";
  void name;

  for await (const product of client.catalogue.products().active(true).all()) {
    void product.id;
  }

  await client.payments.create().customerId("cus_1").priceId("price_1").create();
  await client.payments.create().customerId("cus_1").amount(100).currency("EUR").create();

  // @ts-expect-error a payment cannot be created with no pricing source
  await client.payments.create().customerId("cus_1").create();

  // @ts-expect-error an ad hoc amount must not reach a payment priced canonically
  client.payments.create().priceId("price_1").amount(100);

  // @ts-expect-error a customer cannot be created before an email is set
  await client.customers.create().create();

  const created: Refund = await client.refunds.create().paymentId("pay_1").create();
  void created.id;
  const owned: OwnedRefund = await client.refunds.refund("ref_1").get();
  void owned.customerId;

  const delivery: VerifiedWebhookDelivery = verifyWebhookDelivery({
    body: "{}",
    headers: new Headers(),
    secret: "whsec_x",
  });
  void delivery.deliveryId;

  // @ts-expect-error a parsed body cannot be verified
  verifyWebhookDelivery({ body: {}, headers: {}, secret: "whsec_x" });

  await paymentMethodSetup(client);
  await manualPaging(client);
  await genericPaging(client);
  return await client.request(request);
}

type Client = ReturnType<typeof createBuPaymentClient>;

async function paymentMethodSetup(client: Client): Promise<void> {
  const setup: PaymentMethodSetup = await client.paymentMethods
    .createSetup("cus_1")
    .currency("EUR")
    .returnUrl("https://shop.test/r")
    .consentAcceptedAt("2026-09-24T10:00:00Z")
    .create();
  // @ts-expect-error a presentation exists only once the status narrows to requires_action
  void setup.presentation.url;
  if (setup.status === "requires_action") {
    const redirect: string = setup.presentation.url;
    const confirm: string = setup.actions.confirm.url;
    void redirect;
    void confirm;
  }
  const method = (await client.paymentMethods.list("cus_1").get()).data[0];
  if (method !== undefined) {
    await client.payments
      .create()
      .customerId("cus_1")
      .priceId("price_1")
      .paymentMethodId(method.id)
      .allocation("line_1", 100, "EUR")
      .create();
  }
  const capabilities: BillingCapabilities = await client.billing.capabilities().get();
  const direct: boolean = capabilities.subscriptions.create.direct;
  void direct;
}

async function manualPaging(client: Client): Promise<void> {
  let cursor: string | undefined;
  do {
    const builder = client.catalogue.products().active(true);
    const page = await (cursor === undefined ? builder : builder.cursor(cursor)).get();
    void page.data.length;
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);
}

async function genericPaging(client: Client): Promise<void> {
  const products = paginate<Product, { cursor?: string; active?: boolean }>(
    (query) => client.request<Page<Product>>({ method: "GET", path: "/v1/products", query }),
    { active: true },
  );
  for await (const product of products) {
    void product.id;
  }
}
`;
}
