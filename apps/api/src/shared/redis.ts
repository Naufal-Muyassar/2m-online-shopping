import { Redis } from "ioredis";
import { env } from "../config/env";
import { logger } from "./logger";

export const DEFAULT_REDIS_URL = "redis://localhost:6379";

let client: Redis | undefined;

// Created on first use so processes and tests that never touch stock do not open a connection.
export function getRedis(): Redis {
  if (!client) {
    client = new Redis(env.REDIS_URL ?? DEFAULT_REDIS_URL, { maxRetriesPerRequest: 1 });
    client.on("error", (err) => logger.error({ err }, "redis error"));
  }
  return client;
}

export async function closeRedis(): Promise<void> {
  const c = client;
  client = undefined;
  if (c) await c.quit().catch(() => c.disconnect());
}
