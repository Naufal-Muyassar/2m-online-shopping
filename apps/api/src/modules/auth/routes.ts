import { Router, type Response } from "express";
import { loginRequestSchema, type LoginResponse, type MeResponse, type RefreshResponse } from "@2m/shared";
import { env } from "../../config/env";
import { asyncHandler, validate } from "../../shared/http";
import { authenticate } from "./middleware";
import * as service from "./service";

const COOKIE_NAME = "refresh_token";
const COOKIE_PATH = "/api/v1/auth";

function readRefreshCookie(header: string | undefined): string | undefined {
  const pair = header?.split(";").map((p) => p.trim()).find((p) => p.startsWith(`${COOKIE_NAME}=`));
  return pair ? decodeURIComponent(pair.slice(COOKIE_NAME.length + 1)) : undefined;
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export const authRoutes = Router();

authRoutes.post(
  "/login",
  validate(loginRequestSchema),
  asyncHandler(async (req, res) => {
    const { identifier, password } = req.body as { identifier: string; password: string };
    const result = await service.login(identifier, password, req.get("user-agent") ?? null);
    setRefreshCookie(res, result.refreshToken);
    const body: LoginResponse = { access_token: result.accessToken, user: result.user };
    res.json(body);
  }),
);

authRoutes.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const result = await service.refresh(readRefreshCookie(req.headers.cookie), req.get("user-agent") ?? null);
    setRefreshCookie(res, result.refreshToken);
    const body: RefreshResponse = { access_token: result.accessToken };
    res.json(body);
  }),
);

authRoutes.post(
  "/logout",
  asyncHandler(async (req, res) => {
    await service.logout(readRefreshCookie(req.headers.cookie));
    res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: true, sameSite: "lax", path: COOKIE_PATH });
    res.status(204).end();
  }),
);

authRoutes.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const body: MeResponse = { user: await service.me(req.auth!.sub) };
    res.json(body);
  }),
);
