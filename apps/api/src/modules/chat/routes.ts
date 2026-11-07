import { Router, type Request } from "express";
import {
  chatOpenRequestSchema,
  chatSendRequestSchema,
  chatThreadParamsSchema,
  chatThreadsQuerySchema,
  type ChatChannel,
  type ChatOpenRequest,
  type ChatSendRequest,
} from "@2m/shared";
import { AppError } from "../../shared/errors";
import { asyncHandler, validate } from "../../shared/http";
import { authenticate, branchScope } from "../auth/middleware";
import * as service from "./service";
import type { Viewer } from "./service";

export const chatRoutes = Router();

function viewer(req: Request): Viewer {
  const auth = req.auth;
  if (!auth) throw new AppError(401, "UNAUTHENTICATED", "Missing access token");
  return { userId: auth.sub, role: auth.role, branchId: auth.role === "branch_admin" ? auth.branch_id : null };
}

const isAdmin = (req: Request) => req.auth?.role === "branch_admin" || req.auth?.role === "super_admin";
const threadId = (req: Request) => (req.params as { id: string }).id;

chatRoutes.get(
  "/threads",
  authenticate,
  validate(chatThreadsQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { channel } = req.query as { channel?: ChatChannel };
    res.json(await service.listThreads(viewer(req), isAdmin(req) ? branchScope(req) : null, channel));
  }),
);

chatRoutes.post(
  "/threads",
  authenticate,
  validate(chatOpenRequestSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.openThread(req.body as ChatOpenRequest, viewer(req)));
  }),
);

chatRoutes.get(
  "/threads/:id/messages",
  authenticate,
  validate(chatThreadParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    res.json(await service.messages(threadId(req), viewer(req)));
  }),
);

chatRoutes.post(
  "/threads/:id/messages",
  authenticate,
  validate(chatThreadParamsSchema, "params"),
  validate(chatSendRequestSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.send(threadId(req), req.body as ChatSendRequest, viewer(req)));
  }),
);

chatRoutes.post(
  "/threads/:id/read",
  authenticate,
  validate(chatThreadParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    await service.markRead(threadId(req), viewer(req));
    res.status(204).end();
  }),
);
