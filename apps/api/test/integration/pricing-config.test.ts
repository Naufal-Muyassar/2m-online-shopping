import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../src/shared/db";
import { createFixture, type Fixture } from "../../src/modules/orders/test-fixtures";
import { getPricingConfig } from "../../src/modules/cart/repo";
import { computeShipping } from "../../src/modules/pricing/calc";

let fx: Fixture;

beforeAll(async () => {
  fx = await createFixture(pool);
  await pool.query(
    `INSERT INTO branch_pricing_config (branch_id, base_fee, per_km, free_km, weight_threshold_kg, surcharge_per_kg, fee_min, fee_max, min_order)
     VALUES ($1, 5000, 2000, 1, 20, 500, 0, 30000, 20000)`,
    [fx.branchId],
  );
});

afterAll(async () => {
  await pool.end();
});

describe("ds_v2 pricing config", () => {
  it("defaults to ds_v2 with the DS parameters", async () => {
    const cfg = (await getPricingConfig(pool, fx.branchId))!;
    expect(cfg.pricing_model).toBe("ds_v2");
    expect(computeShipping(cfg, 4.25, 5).base_delivery_fee).toBe(7833);
  });

  it("changing wage_per_km in the DB changes the quote without a deploy", async () => {
    const before = computeShipping((await getPricingConfig(pool, fx.branchId))!, 1, 5).base_delivery_fee;
    await pool.query(`UPDATE branch_pricing_config SET wage_per_km = 3000 WHERE branch_id = $1`, [fx.branchId]);
    const after = computeShipping((await getPricingConfig(pool, fx.branchId))!, 1, 5).base_delivery_fee;
    expect(before).toBe(6000);
    expect(after).toBe(7500);
  });

  it("keeps the linear model selectable", async () => {
    await pool.query(`UPDATE branch_pricing_config SET pricing_model = 'linear' WHERE branch_id = $1`, [fx.branchId]);
    const q = computeShipping((await getPricingConfig(pool, fx.branchId))!, 3.5, 5);
    expect(q.base_delivery_fee).toBe(5000 + 2000 * 2.5);
    expect(q.fee_floor).toBeNull();
  });
});
