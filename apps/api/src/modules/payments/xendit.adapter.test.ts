import { describe, expect, it } from "vitest";
import { PaymentProviderError } from "./provider";
import { XenditAdapter } from "./xendit.adapter";

const cfg = { secretKey: "xnd_development_abc", callbackToken: "cb-token", baseUrl: "https://xendit.test" };
const input = {
  externalId: "ORD-261022-ABCD-1",
  amount: 45000,
  durationSec: 900,
  description: "Pesanan",
  paymentMethod: "VA_BCA" as const,
  successRedirectUrl: "https://web.test/ok",
  failureRedirectUrl: "https://web.test/ok",
};
const invoiceJson = {
  id: "inv-1",
  external_id: input.externalId,
  status: "PENDING",
  amount: 45000,
  invoice_url: "https://checkout.xendit.test/inv-1",
  expiry_date: "2026-10-22T04:00:00.000Z",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("XenditAdapter", () => {
  it("creates an invoice restricted to the chosen method, with basic auth", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const adapter = new XenditAdapter(cfg, (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return json(invoiceJson);
    }) as unknown as typeof fetch);

    const invoice = await adapter.createInvoice(input);
    expect(invoice).toMatchObject({ id: "inv-1", status: "PENDING", amount: 45000, invoiceUrl: invoiceJson.invoice_url });
    expect(seen!.url).toBe("https://xendit.test/v2/invoices");
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("xnd_development_abc:").toString("base64")}`);
    expect(JSON.parse(seen!.init.body as string)).toMatchObject({
      external_id: input.externalId, amount: 45000, invoice_duration: 900, payment_methods: ["BCA"], currency: "IDR",
    });
    expect(seen!.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("marks network errors and 5xx retryable but 4xx not", async () => {
    const down = new XenditAdapter(cfg, (async () => {
      throw new DOMException("timeout", "TimeoutError");
    }) as unknown as typeof fetch);
    await expect(down.createInvoice(input)).rejects.toMatchObject({ retryable: true });

    const fiveHundred = new XenditAdapter(cfg, (async () => json({}, 503)) as unknown as typeof fetch);
    await expect(fiveHundred.getInvoice("inv-1")).rejects.toMatchObject({ retryable: true, status: 503 });

    const bad = new XenditAdapter(cfg, (async () => json({}, 400)) as unknown as typeof fetch);
    const err = await bad.createInvoice(input).catch((e) => e);
    expect(err).toBeInstanceOf(PaymentProviderError);
    expect(err.retryable).toBe(false);
  });

  it("finds an invoice by external_id and returns null when there is none", async () => {
    const found = new XenditAdapter(cfg, (async () => json([invoiceJson])) as unknown as typeof fetch);
    expect((await found.findInvoiceByExternalId(input.externalId))?.id).toBe("inv-1");
    const empty = new XenditAdapter(cfg, (async () => json([])) as unknown as typeof fetch);
    expect(await empty.findInvoiceByExternalId(input.externalId)).toBeNull();
  });

  it("verifies the callback token without throwing on length differences", () => {
    const adapter = new XenditAdapter(cfg);
    expect(adapter.verifyCallbackToken("cb-token")).toBe(true);
    expect(adapter.verifyCallbackToken("cb-tokeN")).toBe(false);
    expect(adapter.verifyCallbackToken("x")).toBe(false);
    expect(adapter.verifyCallbackToken(undefined)).toBe(false);
  });
});
