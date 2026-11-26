import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import type { AssistantAskResponse, AssistantHistoryResponse } from "@2m/shared";
import { createApp } from "../../src/app";
import { env } from "../../src/config/env";
import { createFixture, type Fixture } from "../../src/modules/orders/test-fixtures";
import { pool } from "../../src/shared/db";
import { closeRedis } from "../../src/shared/redis";
import { maskPii } from "../../src/modules/ai-gateway/mask";

type AskBody = AssistantAskResponse & { error: { code: string; details?: { scope?: string } } };

// Stand-in for ml-api: each test queues how the next calls answer.
type Reply = { status: number; body?: unknown; delayMs?: number };
let replies: Reply[] = [];
let calls: { key: string | undefined; body: Record<string, unknown> }[] = [];

const answer = {
  answer: "Ongkir dihitung dari jarak.",
  intent: "tanya_ongkir",
  sources: [{ id: "ongkir#cara-hitung", title: "Cara menghitung ongkir" }],
  fallback_used: false,
  usage: { model: "fake", prompt_version: "faq-v1", input_tokens: 10, output_tokens: 5, latency_ms: 3, cached: false },
  model_version: "none",
};

let ml: Server;
let api: Server;
let base: string;
let fx: Fixture;
let other: Fixture;

const listen = (server: Server) =>
  new Promise<string>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`));
  });

beforeAll(async () => {
  ml = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      calls.push({ key: req.headers["x-internal-key"] as string, body: JSON.parse(raw) });
      const reply = replies.shift() ?? { status: 200, body: answer };
      setTimeout(() => {
        res.writeHead(reply.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(reply.body ?? {}));
      }, reply.delayMs ?? 0);
    });
  });
  env.ML_API_URL = await listen(ml);
  env.ML_API_KEY = "test-internal-key";
  env.ML_API_TIMEOUT_MS = 300;
  api = createServer(createApp());
  base = `${await listen(api)}/api/v1/assistant`;
  fx = await createFixture(pool);
  other = await createFixture(pool);
});

beforeEach(async () => {
  replies = [];
  calls = [];
  env.ASSISTANT_DAILY_LIMIT_PER_USER = 20;
  env.ASSISTANT_DAILY_LIMIT_GLOBAL = 100_000;
  await pool.query(`DELETE FROM llm_usage WHERE user_id = ANY($1)`, [[fx.users.customer, other.users.customer]]);
});

afterAll(async () => {
  ml.closeAllConnections();
  ml.close();
  api.close();
  await pool.end();
  await closeRedis();
});

const auth = (f: Fixture) => ({
  Authorization: `Bearer ${jwt.sign({ sub: f.users.customer, role: "customer", branch_id: null }, env.JWT_ACCESS_SECRET)}`,
});

async function ask(message: string, extra: Record<string, unknown> = {}, who: Fixture = fx) {
  const res = await fetch(`${base}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth(who) },
    body: JSON.stringify({ message, ...extra }),
  });
  return { status: res.status, body: (await res.json()) as AskBody };
}

async function history(query = "", who: Fixture = fx) {
  const res = await fetch(`${base}/history${query}`, { headers: auth(who) });
  return (await res.json()) as AssistantHistoryResponse;
}

const rows = async () =>
  (await pool.query(`SELECT * FROM llm_usage WHERE user_id = $1 ORDER BY created_at, id`, [fx.users.customer])).rows;

describe("assistant ask", () => {
  it("requires a login", async () => {
    const res = await fetch(`${base}/ask`, { method: "POST" });
    expect(res.status).toBe(401);
    expect((await fetch(`${base}/history`)).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("answers, sends the key, and records usage", async () => {
    const res = await ask("ongkir berapa?", { branch_id: fx.branchId });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ answer: answer.answer, intent: "tanya_ongkir", remaining_today: 19 });
    expect(calls).toEqual([
      { key: "test-internal-key", body: { message: "ongkir berapa?", context: { branch_id: fx.branchId } } },
    ]);
    expect(await rows()).toMatchObject([
      { status: "ok", channel: "app", feature: "chat", intent: "tanya_ongkir", model: "fake", input_tokens: 10 },
    ]);
  });

  it("masks personal data before ml-api and before the database", async () => {
    await ask("pesanan ORD-261126-AB12 belum sampai, hubungi 0812-3456-7890 di test street");
    const sent = calls[0]!.body.message as string;
    expect(sent).toBe("pesanan [kode_pesanan] belum sampai, hubungi [nomor] di [alamat]");
    expect((await rows())[0].input_text).toBe(sent);
  });

  it("sends earlier turns of the same thread only to its owner", async () => {
    const first = await ask("halo");
    await ask("lanjut", { thread_id: first.body.thread_id });
    expect(calls[1]!.body.history).toEqual([
      { role: "user", text: "halo" },
      { role: "assistant", text: answer.answer },
    ]);
    await ask("intip", { thread_id: first.body.thread_id }, other);
    expect(calls[2]!.body.history).toBeUndefined();
  });

  it("refuses a message over 500 characters without calling ml-api", async () => {
    const res = await ask("a".repeat(501));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("AI_INPUT_TOO_LONG");
    expect(calls).toHaveLength(0);
    expect(await rows()).toHaveLength(0);
  });
});

describe("ml-api failures", () => {
  it("retries a 5xx once and succeeds", async () => {
    replies = [{ status: 500 }];
    expect((await ask("halo")).status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(await rows()).toHaveLength(1);
  });

  it("maps a persistent 5xx to AI_UNAVAILABLE and records it", async () => {
    replies = [{ status: 503 }, { status: 503 }];
    const res = await ask("halo");
    expect([res.status, res.body.error.code]).toEqual([503, "AI_UNAVAILABLE"]);
    expect(await rows()).toMatchObject([{ status: "error", error_code: "AI_UNAVAILABLE" }]);
  });

  it.each([
    [429, 429, "AI_BUDGET_EXCEEDED"],
    [413, 413, "AI_INPUT_TOO_LONG"],
    [401, 503, "AI_UNAVAILABLE"],
  ])("does not retry ml-api %i", async (mlStatus, status, code) => {
    replies = [{ status: mlStatus }];
    const res = await ask("halo");
    expect([res.status, res.body.error.code]).toEqual([status, code]);
    expect(calls).toHaveLength(1);
  });

  it("times out without retrying", async () => {
    replies = [{ status: 200, body: answer, delayMs: 800 }];
    const res = await ask("halo");
    expect([res.status, res.body.error.code]).toEqual([504, "AI_TIMEOUT"]);
    expect(calls).toHaveLength(1);
  });

  it("rejects a response outside the contract", async () => {
    replies = [{ status: 200, body: { answer: "x" } }];
    expect((await ask("halo")).body.error.code).toBe("AI_UNAVAILABLE");
  });

  it("is unavailable, without using quota, when ml-api is not configured", async () => {
    const url = env.ML_API_URL;
    env.ML_API_URL = undefined;
    const res = await ask("halo");
    env.ML_API_URL = url;
    expect(res.body.error.code).toBe("AI_UNAVAILABLE");
    expect(await rows()).toHaveLength(0);
  });
});

describe("daily limits", () => {
  it("stops one user at their limit, records the refusal once, and leaves others alone", async () => {
    env.ASSISTANT_DAILY_LIMIT_PER_USER = 2;
    await ask("satu");
    expect((await ask("dua")).body.remaining_today).toBe(0);
    for (let i = 0; i < 3; i++) {
      const res = await ask("lagi");
      expect([res.status, res.body.error.code, res.body.error.details?.scope]).toEqual([429, "AI_BUDGET_EXCEEDED", "user"]);
    }
    expect(calls).toHaveLength(2);
    expect((await rows()).map((r) => r.status)).toEqual(["ok", "ok", "budget"]);
    expect((await ask("halo", {}, other)).status).toBe(200);
  });

  it("does not let parallel requests exceed the limit", async () => {
    env.ASSISTANT_DAILY_LIMIT_PER_USER = 3;
    const results = await Promise.all(Array.from({ length: 8 }, () => ask("serentak")));
    expect(results.filter((r) => r.status === 200)).toHaveLength(3);
    expect(calls).toHaveLength(3);
  });

  it("applies the global limit across users", async () => {
    // Counted from whatever is already in the table today, so the limit is relative to it.
    const today = await pool.query(
      `SELECT count(*)::int AS n FROM llm_usage WHERE status <> 'budget'
        AND created_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Jakarta') AT TIME ZONE 'Asia/Jakarta')`,
    );
    env.ASSISTANT_DAILY_LIMIT_GLOBAL = today.rows[0].n + 1;
    expect((await ask("satu")).status).toBe(200);
    const res = await ask("dua", {}, other);
    expect(res.body.error.details?.scope).toBe("global");
  });

  it("does not count yesterday", async () => {
    env.ASSISTANT_DAILY_LIMIT_PER_USER = 1;
    await ask("kemarin");
    await pool.query(`UPDATE llm_usage SET created_at = now() - interval '25 hours' WHERE user_id = $1`, [
      fx.users.customer,
    ]);
    expect((await ask("hari ini")).status).toBe(200);
  });
});

describe("history", () => {
  it("pages the caller's answered questions, newest first", async () => {
    await ask("satu");
    await ask("dua");
    await ask("tiga");
    replies = [{ status: 401 }];
    await ask("gagal");

    const first = await history("?limit=2");
    expect(first.items.map((i) => i.message)).toEqual(["tiga", "dua"]);
    const second = await history(`?limit=2&cursor=${first.next_cursor}`);
    expect(second.items.map((i) => i.message)).toEqual(["satu"]);
    expect(second.next_cursor).toBeNull();
    expect((await history("", other)).items).toEqual([]);
  });
});

describe("maskPii", () => {
  const known = { names: ["Budi Santoso"], addresses: ["Gang Mawar"] };

  it.each([
    ["email saya budi@contoh.co.id", "email saya [email]"],
    ["transfer ke 1234 5678 9012", "transfer ke [nomor]"],
    ["wa +62 812 3456 789", "wa [nomor]"],
    ["atas nama Siti Aminah", "atas nama [nama]"],
    ["ini budi santoso", "ini [nama]"],
    ["antar ke Gang Mawar ya", "antar ke [alamat] ya"],
    ["rumah di jl. melati no 5, depan masjid", "rumah di [alamat], depan masjid"],
    ["jalan kenanga 12 rt 03/05", "[alamat] [alamat]"],
  ])("masks %s", (input, expected) => {
    expect(maskPii(input, known)).toBe(expected);
  });

  it.each(["pesanan saya udah jalan belum?", "ongkir 15000 untuk 5 km", "total Rp1.500.000", "beras 5kg ada?"])(
    "leaves %s alone",
    (input) => {
      expect(maskPii(input, known)).toBe(input);
    },
  );
});
