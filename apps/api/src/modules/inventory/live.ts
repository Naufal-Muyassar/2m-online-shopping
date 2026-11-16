import type { Response } from "express";
import type { Redis } from "ioredis";
import type { StockEvent, StockLevel } from "@2m/shared";
import { pool } from "../../shared/db";
import { logger } from "../../shared/logger";
import { getRedis } from "../../shared/redis";
import { stockStatusOf } from "../catalog/stock";
import { ALL_CHANGED, CHANGED_CHANNEL, counterKey, readCounters } from "./counters";
import { computeSellable } from "./repo";

// Live stock for the storefront over Server-Sent Events.
//
// Read-only and best effort by design: what a customer sees is a hint, the checkout reservation is the guarantee.
// Every counter write publishes the changed keys on Redis (counters.notify), so all API instances hear it. Each
// instance coalesces bursts (a rush of checkouts on one product becomes one push per FLUSH_MS), reads the current
// values itself and sends a client only the products that changed for it. A periodic resync covers lost messages,
// a Redis reconnect and Postgres-only changes. The stream never holds a database connection.

const FLUSH_MS = 250;
const RESYNC_MS = 15_000;
const HEARTBEAT_MS = 20_000;
export const MAX_STREAMS = 2_000;

interface Client {
  res: Response;
  branchId: string;
  keys: string[];
  sent: Map<string, number>;
}

const byKey = new Map<string, Set<Client>>();
const clients = new Set<Client>();
const dirty = new Set<string>();
let flushTimer: NodeJS.Timeout | undefined;
let resyncTimer: NodeJS.Timeout | undefined;
let heartbeatTimer: NodeJS.Timeout | undefined;
let subscriber: Redis | undefined;

const parseKey = (key: string): { branchId: string; productId: string } => {
  const [, branchId = "", productId = ""] = key.split(":");
  return { branchId, productId };
};

function ensureSubscriber(): void {
  if (subscriber) return;
  try {
    subscriber = getRedis().duplicate();
    subscriber.on("error", (err) => logger.warn({ err }, "stock live subscriber error"));
    subscriber.on("message", (_channel: string, message: string) => {
      if (message === ALL_CHANGED) for (const k of byKey.keys()) dirty.add(k);
      else for (const k of message.split(",")) if (byKey.has(k)) dirty.add(k);
      scheduleFlush();
    });
    subscriber.subscribe(CHANGED_CHANNEL).catch((err) => logger.warn({ err }, "stock live subscribe failed"));
  } catch (err) {
    logger.warn({ err }, "stock live subscriber unavailable, falling back to periodic resync");
  }
}

function scheduleFlush(): void {
  if (flushTimer || dirty.size === 0) return;
  flushTimer = setTimeout(() => {
    flushTimer = undefined;
    void flush();
  }, FLUSH_MS);
}

// Redis first (it already counts in-flight reservations); Postgres for counters that are missing or when Redis is down.
async function readLevels(keys: readonly string[]): Promise<Map<string, number>> {
  const levels = new Map<string, number>();
  let values: (number | null)[] = [];
  try {
    values = await readCounters(keys);
  } catch (err) {
    logger.warn({ err }, "stock counters unreadable, live stock read from Postgres");
  }
  const missing: string[] = [];
  keys.forEach((k, i) => {
    const v = values[i];
    if (v === null || v === undefined || Number.isNaN(v)) missing.push(k);
    else levels.set(k, v);
  });
  const byBranch = new Map<string, string[]>();
  for (const k of missing) {
    const { branchId, productId } = parseKey(k);
    byBranch.set(branchId, [...(byBranch.get(branchId) ?? []), productId]);
  }
  for (const [branchId, productIds] of byBranch) {
    for (const r of await computeSellable(pool, { branchId, productIds })) levels.set(counterKey(r.branch_id, r.product_id), r.sellable);
  }
  return levels;
}

function send(client: Client, levels: Map<string, number>, onlyChanged: boolean): void {
  const items: StockLevel[] = [];
  for (const key of client.keys) {
    const raw = levels.get(key);
    if (raw === undefined) continue;
    const qty = Math.max(0, raw);
    if (onlyChanged && client.sent.get(key) === qty) continue;
    client.sent.set(key, qty);
    items.push({ product_id: parseKey(key).productId, sellable_qty: qty, stock_status: stockStatusOf(qty) });
  }
  if (items.length === 0 && onlyChanged) return;
  const event: StockEvent = { items };
  client.res.write(`event: stock\ndata: ${JSON.stringify(event)}\n\n`);
}

async function flush(): Promise<void> {
  const keys = [...dirty].filter((k) => byKey.has(k));
  dirty.clear();
  if (keys.length === 0) return;
  try {
    const levels = await readLevels(keys);
    const touched = new Set<Client>();
    for (const k of keys) for (const c of byKey.get(k) ?? []) touched.add(c);
    for (const c of touched) send(c, levels, true);
  } catch (err) {
    logger.warn({ err }, "stock live flush failed");
  }
}

function startTimers(): void {
  resyncTimer ??= setInterval(() => {
    for (const k of byKey.keys()) dirty.add(k);
    scheduleFlush();
  }, RESYNC_MS);
  heartbeatTimer ??= setInterval(() => {
    for (const c of clients) c.res.write(`: ping\n\n`);
  }, HEARTBEAT_MS);
}

function stopTimersIfIdle(): void {
  if (clients.size > 0) return;
  clearInterval(resyncTimer);
  clearInterval(heartbeatTimer);
  resyncTimer = heartbeatTimer = undefined;
}

export const liveStreamCount = (): number => clients.size;

// Takes over the response. Resolves once the first snapshot is written.
export async function openStockStream(res: Response, branchId: string, productIds: readonly string[]): Promise<void> {
  const client: Client = { res, branchId, keys: productIds.map((p) => counterKey(branchId, p)), sent: new Map() };

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Proxies (nginx-style) must not buffer the stream.
    "X-Accel-Buffering": "no",
  });
  res.write(`retry: 3000\n\n`);

  clients.add(client);
  for (const k of client.keys) {
    let set = byKey.get(k);
    if (!set) byKey.set(k, (set = new Set()));
    set.add(client);
  }
  res.on("close", () => {
    clients.delete(client);
    for (const k of client.keys) {
      const set = byKey.get(k);
      set?.delete(client);
      if (set && set.size === 0) byKey.delete(k);
    }
    stopTimersIfIdle();
  });

  ensureSubscriber();
  startTimers();
  try {
    send(client, await readLevels(client.keys), false);
  } catch (err) {
    logger.warn({ err }, "stock live snapshot failed");
  }
}

export async function closeLiveStock(): Promise<void> {
  for (const c of clients) c.res.end();
  clients.clear();
  byKey.clear();
  stopTimersIfIdle();
  const s = subscriber;
  subscriber = undefined;
  if (s) await s.quit().catch(() => s.disconnect());
}
