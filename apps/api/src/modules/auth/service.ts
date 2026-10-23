import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { AuthUser, RegisterRequest } from "@2m/shared";
import { env } from "../../config/env";
import { pool, withTransaction } from "../../shared/db";
import { AppError } from "../../shared/errors";
import * as repo from "./repo";

export interface AccessClaims {
  sub: string;
  role: AuthUser["role"];
  branch_id: string | null;
  partner_id?: string;
}

const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");
const newRefreshToken = (): string => randomBytes(32).toString("base64url");

function toUser(u: repo.UserRow): AuthUser {
  return { id: u.id, role: u.role, name: u.name, phone: u.phone, branch_id: u.branch_id, partner_id: u.partner_id };
}

function signAccess(u: repo.UserRow): string {
  const claims: AccessClaims = { sub: u.id, role: u.role, branch_id: u.branch_id };
  if (u.partner_id) claims.partner_id = u.partner_id;
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, { algorithm: "HS256", expiresIn: env.ACCESS_TOKEN_TTL_SEC });
}

export function verifyAccess(token: string): AccessClaims {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] }) as AccessClaims;
}

const invalidCredentials = () => new AppError(401, "INVALID_CREDENTIALS", "Invalid credentials");

export async function login(identifier: string, password: string, userAgent: string | null) {
  const user = await repo.findUserByIdentifier(pool, identifier);
  if (!user || !user.is_active || !(await bcrypt.compare(password, user.password_hash))) throw invalidCredentials();
  if (user.role === "courier") await repo.setCourierOfflineOnLogin(pool, user.id);

  const refreshToken = newRefreshToken();
  await repo.insertSession(pool, {
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    ttlDays: env.REFRESH_TOKEN_TTL_DAYS,
    userAgent,
  });
  return { accessToken: signAccess(user), refreshToken, user: toUser(user) };
}

export async function register(input: RegisterRequest, userAgent: string | null) {
  const passwordHash = await bcrypt.hash(input.password, 10);
  let user: repo.UserRow | null;
  try {
    user = await repo.insertCustomer(pool, { ...input, email: input.email ?? null, passwordHash });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      throw new AppError(409, "ACCOUNT_EXISTS", "Phone number or email is already registered");
    }
    throw err;
  }
  const refreshToken = newRefreshToken();
  await repo.insertSession(pool, {
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    ttlDays: env.REFRESH_TOKEN_TTL_DAYS,
    userAgent,
  });
  return { accessToken: signAccess(user), refreshToken, user: toUser(user) };
}

export async function refresh(presented: string | undefined, userAgent: string | null) {
  if (!presented) throw new AppError(401, "INVALID_REFRESH_TOKEN", "Invalid refresh token");
  return withTransaction(async (tx) => {
    const session = await repo.lockActiveSession(tx, hashToken(presented));
    const user = session ? await repo.findUserById(tx, session.user_id) : null;
    if (!session || !user || !user.is_active) throw new AppError(401, "INVALID_REFRESH_TOKEN", "Invalid refresh token");

    await repo.revokeSession(tx, session.id);
    const refreshToken = newRefreshToken();
    await repo.insertSession(tx, {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      ttlDays: env.REFRESH_TOKEN_TTL_DAYS,
      userAgent,
    });
    return { accessToken: signAccess(user), refreshToken };
  });
}

export async function logout(presented: string | undefined): Promise<void> {
  if (presented) await repo.revokeByTokenHash(pool, hashToken(presented));
}

export async function me(userId: string): Promise<AuthUser> {
  const user = await repo.findUserById(pool, userId);
  if (!user || !user.is_active) throw new AppError(401, "UNAUTHENTICATED", "Account unavailable");
  return toUser(user);
}
