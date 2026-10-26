import { z } from "zod";

// GET /meta/config (public)
export const metaConfigResponseSchema = z.object({ demo_mode: z.boolean() });
export type MetaConfigResponse = z.infer<typeof metaConfigResponseSchema>;
