import express, { Router } from "express";
import { asyncHandler } from "../../shared/http";
import { handleXenditWebhook } from "./service";

export const webhooksRoutes = Router();

// Mounted before express.json(): the raw body is stored as received and parsed only after the token check.
webhooksRoutes.post(
  "/xendit",
  express.raw({ type: () => true, limit: "256kb" }),
  asyncHandler(async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
    res.status(await handleXenditWebhook(rawBody, req.headers)).end();
  }),
);
