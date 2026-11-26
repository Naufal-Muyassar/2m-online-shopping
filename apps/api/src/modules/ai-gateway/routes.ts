import { Router } from "express";
import {
  assistantAskRequestSchema,
  assistantHistoryQuerySchema,
  type AssistantAskRequest,
  type AssistantHistoryQuery,
} from "@2m/shared";
import { asyncHandler, validate } from "../../shared/http";
import { authenticate } from "../auth/middleware";
import * as service from "./service";

export const assistantRoutes = Router();

assistantRoutes.post(
  "/ask",
  authenticate,
  validate(assistantAskRequestSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.ask(req.auth!.sub, req.body as AssistantAskRequest));
  }),
);

assistantRoutes.get(
  "/history",
  authenticate,
  validate(assistantHistoryQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    res.json(await service.history(req.auth!.sub, req.query as unknown as AssistantHistoryQuery));
  }),
);
