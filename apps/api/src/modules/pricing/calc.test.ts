import { describe, expect, it } from "vitest";
import { computePaymentFee, computeShipping } from "./calc";

const cfg = {
  base_fee: 5000,
  per_km: 2000,
  free_km: 1,
  weight_threshold_kg: 20,
  surcharge_per_kg: 500,
  fee_min: 6000,
  fee_max: 30000,
};

describe("computeShipping", () => {
  it("charges base only inside the free distance", () => {
    expect(computeShipping(cfg, 0.8, 5)).toEqual({
      base_delivery_fee: 5000,
      weight_surcharge: 0,
      final_shipping_cost: 6000, // clamped up to fee_min
    });
  });

  it("adds per-km beyond free_km", () => {
    expect(computeShipping(cfg, 3.5, 5).base_delivery_fee).toBe(5000 + 2000 * 2.5);
  });

  it("surcharges each started kg above the threshold", () => {
    const q = computeShipping(cfg, 2, 20.2);
    expect(q.weight_surcharge).toBe(500);
    expect(q.final_shipping_cost).toBe(7500);
  });

  it("clamps to fee_max", () => {
    expect(computeShipping(cfg, 40, 80).final_shipping_cost).toBe(30000);
  });
});

describe("computePaymentFee", () => {
  it("is zero when absorbed", () => {
    expect(computePaymentFee({ absorbed: true, fee_flat: 500, fee_percent: 1 }, 100000)).toBe(0);
  });
  it("adds flat and percent otherwise", () => {
    expect(computePaymentFee({ absorbed: false, fee_flat: 500, fee_percent: 0.7 }, 100000)).toBe(1200);
  });
});
