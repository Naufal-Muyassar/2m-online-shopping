import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { pool } from "../../src/shared/db";
import { createFixture, insertOrder, type Fixture } from "../../src/modules/orders/test-fixtures";
import { drainBranch, tryAssign } from "../../src/modules/dispatch/service";

let fx: Fixture;
const courierIds: string[] = [];
const orderIds: string[] = [];

async function addCourier(): Promise<string> {
  const tag = randomUUID().slice(0, 8);
  const partner = (await pool.query(`SELECT partner_id FROM couriers WHERE user_id = $1`, [fx.courierId])).rows[0]
    .partner_id as string;
  const id = (
    await pool.query(
      `INSERT INTO users (role, name, phone, password_hash, branch_id) VALUES ('courier', $1, $2, 'x', $3) RETURNING id`,
      [`courier-${tag}`, `t-courier-${tag}`, fx.branchId],
    )
  ).rows[0].id as string;
  await pool.query(`INSERT INTO couriers (user_id, partner_id, branch_id, status) VALUES ($1,$2,$3,'IDLE')`, [
    id,
    partner,
    fx.branchId,
  ]);
  return id;
}

describe("dispatch", () => {
  beforeAll(async () => {
    fx = await createFixture(pool);
    courierIds.push(fx.courierId, await addCourier(), await addCourier());
    for (let i = 0; i < 10; i++) {
      const id = await insertOrder(pool, fx, "READY");
      await pool.query(`UPDATE orders SET ready_at = now() + ($2 || ' milliseconds')::interval WHERE id = $1`, [id, i]);
      orderIds.push(id);
    }
  });
  afterAll(async () => {
    await pool.end();
  });

  it("assigns 10 parallel READY orders to 3 idle couriers without double assignment", async () => {
    await Promise.all(orderIds.map((id) => tryAssign(id)));
    await drainBranch(fx.branchId);

    const assigned = (
      await pool.query(
        `SELECT assigned_courier_id FROM orders WHERE id = ANY($1::uuid[]) AND status = 'ASSIGNED'`,
        [orderIds],
      )
    ).rows.map((r) => r.assigned_courier_id as string);
    expect(assigned).toHaveLength(3);
    expect(new Set(assigned).size).toBe(3);
    expect(new Set(assigned)).toEqual(new Set(courierIds));

    const ready = await pool.query(`SELECT count(*)::int AS n FROM orders WHERE id = ANY($1::uuid[]) AND status = 'READY'`, [
      orderIds,
    ]);
    expect(ready.rows[0].n).toBe(7);

    const couriers = await pool.query(`SELECT status FROM couriers WHERE user_id = ANY($1::uuid[])`, [courierIds]);
    expect(couriers.rows.every((r) => r.status === "DELIVERING")).toBe(true);
  });
});
