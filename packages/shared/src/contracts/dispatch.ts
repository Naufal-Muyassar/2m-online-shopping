import { z } from "zod";

// PATCH /orders/:id/reassign (branch_admin); without courier_id the order returns to the FIFO queue
export const reassignRequestSchema = z.object({
  courier_id: z.string().uuid().optional(),
  idempotency_key: z.string().uuid().optional(),
});
export type ReassignRequest = z.infer<typeof reassignRequestSchema>;
