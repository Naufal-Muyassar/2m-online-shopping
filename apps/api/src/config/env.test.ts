import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const base = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://localhost:5432/x",
  JWT_ACCESS_SECRET: "0123456789abcdef0123",
  S3_ENDPOINT: "http://localhost:9000",
  S3_BUCKET: "proofs",
  S3_ACCESS_KEY: "k",
  S3_SECRET_KEY: "s",
};
const prodBase = { ...base, NODE_ENV: "production", REDIS_URL: "redis://localhost:6379" };

describe("env boot rules", () => {
  it("throws for the mock provider with DEMO_MODE=false", () => {
    expect(() => parseEnv({ ...base, PAYMENT_PROVIDER: "mock", DEMO_MODE: "false" })).toThrow();
  });

  it("allows the mock provider in production only with DEMO_MODE=true", () => {
    const prod = { ...prodBase, PAYMENT_PROVIDER: "mock" };
    expect(() => parseEnv(prod)).toThrow();
    expect(parseEnv({ ...prod, DEMO_MODE: "true" })).toMatchObject({
      DEMO_MODE: true,
      PAYMENT_PROVIDER: "mock",
      RUN_WORKER_IN_PROCESS: true,
    });
  });

  it("defaults DEMO_MODE and the in-process worker by environment", () => {
    expect(parseEnv(base)).toMatchObject({ DEMO_MODE: true, RUN_WORKER_IN_PROCESS: true });
    expect(
      parseEnv({ ...prodBase, XENDIT_SECRET_KEY: "xnd_production_x", XENDIT_CALLBACK_TOKEN: "t", XENDIT_TEST_MODE: "false" }),
    ).toMatchObject({ DEMO_MODE: false, PAYMENT_PROVIDER: "xendit", RUN_WORKER_IN_PROCESS: false });
  });
});
