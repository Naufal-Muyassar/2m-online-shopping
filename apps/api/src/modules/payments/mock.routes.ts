import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { asyncHandler, validate } from "../../shared/http";
import { authenticate } from "../auth/middleware";
import { assertInvoiceAccess, expireMockInvoice, getMockInvoice, payMockInvoice } from "./mock.service";

// Mounted by app.ts only when PAYMENT_PROVIDER=mock and DEMO_MODE=true.
export const mockPaymentsRoutes = Router();

mockPaymentsRoutes.use(authenticate);

const params = validate(z.object({ invoiceId: z.string().min(1).max(100) }), "params");

const ownerOrAdmin: RequestHandler = asyncHandler(async (req, _res, next) => {
  await assertInvoiceAccess(req.params.invoiceId as string, req.auth!);
  next();
});

mockPaymentsRoutes.get(
  "/:invoiceId",
  params,
  ownerOrAdmin,
  asyncHandler(async (req, res) => {
    res.json(await getMockInvoice(req.params.invoiceId as string));
  }),
);

mockPaymentsRoutes.post(
  "/:invoiceId/pay",
  params,
  ownerOrAdmin,
  asyncHandler(async (req, res) => {
    const outcome = await payMockInvoice(req.params.invoiceId as string);
    res.json({ outcome, invoice: await getMockInvoice(req.params.invoiceId as string) });
  }),
);

mockPaymentsRoutes.post(
  "/:invoiceId/expire",
  params,
  ownerOrAdmin,
  asyncHandler(async (req, res) => {
    const outcome = await expireMockInvoice(req.params.invoiceId as string);
    res.json({ outcome, invoice: await getMockInvoice(req.params.invoiceId as string) });
  }),
);
