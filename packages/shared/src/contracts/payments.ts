import { z } from "zod";

// Body of the Xendit invoice callback. Only identifiers are read from it; status and amounts always come from a re-fetch.
export const xenditInvoiceCallbackSchema = z
  .object({
    id: z.string().min(1),
    external_id: z.string().optional(),
    status: z.string().min(1),
  })
  .passthrough();
export type XenditInvoiceCallback = z.infer<typeof xenditInvoiceCallbackSchema>;
