import { z } from "zod";
import { ROLES } from "../constants";

export const authUserSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(ROLES),
  name: z.string(),
  branch_id: z.string().uuid().nullable(),
  partner_id: z.string().uuid().nullable(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

// POST /auth/login
export const loginRequestSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

// POST /auth/register (customers only; responds with LoginResponse)
export const registerRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().regex(/^\+?[0-9]{8,16}$/, "Nomor telepon tidak valid"),
  email: z.string().trim().email().optional(),
  password: z.string().min(8).max(100),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginResponseSchema = z.object({
  access_token: z.string(),
  user: authUserSchema,
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

// POST /auth/refresh (refresh token travels in the HttpOnly cookie)
export const refreshResponseSchema = z.object({ access_token: z.string() });
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;

// GET /auth/me
export const meResponseSchema = z.object({ user: authUserSchema });
export type MeResponse = z.infer<typeof meResponseSchema>;
