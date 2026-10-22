import { defineConfig } from "vitest/config";

try {
  process.loadEnvFile(new URL("../../.env", import.meta.url));
} catch {
  // no .env: rely on the ambient environment
}

// Test-only fallbacks so only DATABASE_URL has to be provided.
process.env.JWT_ACCESS_SECRET ??= "test-only-access-secret-0123456789";
process.env.S3_ENDPOINT ??= "http://localhost:9000";
process.env.S3_BUCKET ??= "proofs";
process.env.S3_ACCESS_KEY ??= "test";
process.env.S3_SECRET_KEY ??= "test";
process.env.DATABASE_URL ??= "postgres://app:app@localhost:5432/sembako";

export default defineConfig({
  test: { include: ["src/**/*.test.ts", "test/**/*.test.ts"], testTimeout: 30_000, hookTimeout: 30_000 },
});
