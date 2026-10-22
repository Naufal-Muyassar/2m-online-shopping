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
