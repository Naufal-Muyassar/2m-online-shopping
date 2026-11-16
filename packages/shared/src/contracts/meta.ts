import { z } from "zod";

// GET /meta/config (public)
export const metaConfigResponseSchema = z.object({
  demo_mode: z.boolean(),
  // Where the browser opens the live stock stream; null means same origin (/api/v1, e.g. the Vite dev proxy).
  live_stock_origin: z.string().url().nullable(),
});
export type MetaConfigResponse = z.infer<typeof metaConfigResponseSchema>;
