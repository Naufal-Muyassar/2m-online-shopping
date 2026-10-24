import { Router } from "express";
import { z } from "zod";
import { asyncHandler, validate } from "../../shared/http";
import { expireMockInvoice, getMockInvoice, payMockInvoice } from "./mock.service";

// Dev only: mounted by app.ts when PAYMENT_PROVIDER=mock and NODE_ENV is not production.
export const mockPaymentsRoutes = Router();

const params = validate(z.object({ invoiceId: z.string().min(1).max(100) }), "params");

mockPaymentsRoutes.get(
  "/:invoiceId",
  params,
  asyncHandler(async (req, res) => {
    res.json(await getMockInvoice(req.params.invoiceId as string));
  }),
);

mockPaymentsRoutes.post(
  "/:invoiceId/pay",
  params,
  asyncHandler(async (req, res) => {
    const outcome = await payMockInvoice(req.params.invoiceId as string);
    res.json({ outcome, invoice: await getMockInvoice(req.params.invoiceId as string) });
  }),
);

mockPaymentsRoutes.post(
  "/:invoiceId/expire",
  params,
  asyncHandler(async (req, res) => {
    const outcome = await expireMockInvoice(req.params.invoiceId as string);
    res.json({ outcome, invoice: await getMockInvoice(req.params.invoiceId as string) });
  }),
);
