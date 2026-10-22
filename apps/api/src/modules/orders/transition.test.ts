import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { ORDER_STATUSES, findTransition, type Actor, type OrderStatus } from "@2m/shared";
import { pool, withTransaction, type Tx } from "../../shared/db";
import { AppError } from "../../shared/errors";
import { transition } from "./service";
import { createFixture, insertOrder, type Fixture } from "./test-fixtures";

const ACTORS: Actor[] = ["system", "customer", "courier", "branch_admin", "super_admin"];

describe("transition matrix", () => {
  it("allows exactly the table pairs for permitted actors", async () => {
    const rollback = new Error("rollback");
    await withTransaction(async (tx) => {
      const fx = await createFixture(tx);
      for (const from of ORDER_STATUSES) {
        for (const to of ORDER_STATUSES) {
          const rule = findTransition(from, to);
          for (const role of ACTORS) {
            const outcome = await attempt(tx, fx, from, to, role);
            if (!rule) expect(outcome, `${from}→${to} as ${role}`).toBe("INVALID_TRANSITION");
            else if (rule.actors.includes(role)) expect(outcome, `${from}→${to} as ${role}`).toBe("ok");
            else expect(outcome, `${from}→${to} as ${role}`).toBe("FORBIDDEN");
          }
        }
      }
      throw rollback;
    }).catch((err) => {
      if (err !== rollback) throw err;
    });
  });
});

async function attempt(tx: Tx, fx: Fixture, from: OrderStatus, to: OrderStatus, role: Actor): Promise<string> {
  const orderId = await insertOrder(tx, fx, from);
  try {
    await transition(tx, {
      orderId,
      to,
      actor: { id: role === "system" ? null : fx.users[role], role },
      meta: {
        lat: -6.2,
        lng: 106.8,
        client_ts: new Date().toISOString(),
        reason: to === "FAILED" ? "CUSTOMER_UNREACHABLE" : "test reason",
        note: "test note",
        courier_id: fx.courierId,
        invoice: { id: `inv-${randomUUID()}`, url: "https://checkout.test/x", expires_at: new Date(Date.now() + 900_000) },
      },
    });
    return "ok";
  } catch (err) {
    if (err instanceof AppError) return err.code;
    throw err;
  }
}

describe("PENDING_PAYMENT", () => {
  it("requires invoice data", async () => {
    const rollback = new Error("rollback");
    await withTransaction(async (tx) => {
      const fx = await createFixture(tx);
      const orderId = await insertOrder(tx, fx, "CREATED");
      await expect(
        transition(tx, { orderId, to: "PENDING_PAYMENT", actor: { id: null, role: "system" } }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR", details: { missing: ["invoice_url"] } });
      throw rollback;
    }).catch((err) => {
      if (err !== rollback) throw err;
    });
  });
});

let fx: Fixture;
describe("concurrent transitions", () => {
  beforeAll(async () => {
    fx = await createFixture(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  it("lets exactly one of two concurrent identical transitions win", async () => {
    const orderId = await insertOrder(pool, fx, "PAID");
    const run = () =>
      withTransaction((tx) =>
        transition(tx, { orderId, to: "ACCEPTED", actor: { id: fx.users.branch_admin, role: "branch_admin" } }),
      );
    const results = await Promise.allSettled([run(), run()]);
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect((lost[0]!.reason as AppError).code).toBe("INVALID_TRANSITION");

    const rows = await pool.query(`SELECT count(*)::int AS n FROM order_state_transitions WHERE order_id = $1`, [
      orderId,
    ]);
    expect(rows.rows[0].n).toBe(1);
  });
});
