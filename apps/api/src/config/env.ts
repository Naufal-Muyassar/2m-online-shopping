import { z } from "zod";

// Empty values in .env count as unset.
const optionalString = z.string().optional().transform((v) => (v ? v : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(3000),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z.string().min(1),
  // Supabase poolers present a certificate chain Node does not trust; "true" encrypts without verifying it.
  DATABASE_SSL: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  // Stock counters live here (fast path of reservations). Falls back to a local Redis outside production.
  REDIS_URL: optionalString.pipe(z.string().url().optional()),
  JWT_ACCESS_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(30),
  S3_ENDPOINT: z.string().min(1),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  XENDIT_SECRET_KEY: optionalString,
  XENDIT_CALLBACK_TOKEN: optionalString,
  // Test mode must match the key: xnd_development_* keys only with true, xnd_production_* only with false.
  XENDIT_TEST_MODE: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  XENDIT_BASE_URL: z.string().url().default("https://api.xendit.co"),
  // Defaults to mock outside production and to xendit in production (see the transform below).
  PAYMENT_PROVIDER: z.enum(["xendit", "mock"]).optional(),
  // Outbox worker, stock sweeper and payment reconciliation inside the API process. Defaults to true outside
  // production; production runs worker.ts as its own process.
  RUN_WORKER_IN_PROCESS: z.enum(["true", "false"]).optional().transform((v) => (v === undefined ? undefined : v === "true")),
  // Public origin of customer-web; Xendit (or the mock pay page) sends the customer back to it.
  CUSTOMER_WEB_URL: z.string().url().default("http://localhost:5171"),
}).superRefine((e, ctx) => {
  const provider = e.PAYMENT_PROVIDER ?? (e.NODE_ENV === "production" ? "xendit" : "mock");
  if (provider === "mock" && e.NODE_ENV === "production") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["PAYMENT_PROVIDER"], message: "mock is not allowed in production" });
  }
  if (provider === "xendit") {
    for (const k of ["XENDIT_SECRET_KEY", "XENDIT_CALLBACK_TOKEN"] as const) {
      if (!e[k]) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [k], message: "required when PAYMENT_PROVIDER=xendit" });
      }
    }
  }
  if (e.NODE_ENV === "production" && !e.REDIS_URL) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["REDIS_URL"], message: "required in production" });
  }
  if (e.XENDIT_SECRET_KEY) {
    const isDevKey = e.XENDIT_SECRET_KEY.startsWith("xnd_development_");
    if (isDevKey !== e.XENDIT_TEST_MODE) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["XENDIT_TEST_MODE"], message: "does not match XENDIT_SECRET_KEY" });
    }
  }
}).transform((e) => ({
  ...e,
  PAYMENT_PROVIDER: e.PAYMENT_PROVIDER ?? (e.NODE_ENV === "production" ? ("xendit" as const) : ("mock" as const)),
  RUN_WORKER_IN_PROCESS: e.RUN_WORKER_IN_PROCESS ?? e.NODE_ENV !== "production",
}));

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
