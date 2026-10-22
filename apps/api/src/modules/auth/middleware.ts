import type { Request, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import type { Role } from "@2m/shared";
import { AppError } from "../../shared/errors";
import { verifyAccess, type AccessClaims } from "./service";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AccessClaims;
    }
  }
}

export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(new AppError(401, "UNAUTHENTICATED", "Missing access token"));
  try {
    req.auth = verifyAccess(token);
    next();
  } catch (err) {
    const expired = err instanceof jwt.TokenExpiredError;
    next(new AppError(401, expired ? "TOKEN_EXPIRED" : "UNAUTHENTICATED", "Invalid access token"));
  }
};

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(new AppError(401, "UNAUTHENTICATED", "Missing access token"));
    if (!roles.includes(req.auth.role)) return next(new AppError(403, "FORBIDDEN", "Insufficient role"));
    next();
  };
}

const uuid = z.string().uuid();

// Branch comes from the token; only super_admin may name one explicitly.
export function branchScope(req: Request): string {
  const auth = req.auth;
  if (!auth) throw new AppError(401, "UNAUTHENTICATED", "Missing access token");
  if (auth.role === "super_admin") {
    const explicit = uuid.safeParse(req.query.branch_id ?? (req.body as { branch_id?: unknown } | undefined)?.branch_id);
    if (!explicit.success) throw new AppError(400, "BRANCH_REQUIRED", "branch_id is required for super_admin");
    return explicit.data;
  }
  if (!auth.branch_id) throw new AppError(403, "FORBIDDEN", "No branch assigned to this account");
  return auth.branch_id;
}
