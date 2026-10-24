import { describe, expect, it } from "vitest";
import { computePaymentFee, computeShipping, courierWageFull } from "./calc";

const dsV2 = {
  wage_base: 3500,
  wage_per_km: 1500,
  failed_rate: 0.03,
  failed_pay_fraction: 0.5,
  failed_fee_charged_fraction: 0,
  overhead_per_day: 10000,
  drops_per_day: 15,
  round_to: 500,
  cap_min_fee: 7500,
  cap_free_km: 4,
  cap_per_km: 1333.33,
};

const cfg = {
  ...dsV2,
  pricing_model: "linear" as const,
  base_fee: 5000,
  per_km: 2000,
  free_km: 1,
  weight_threshold_kg: 20,
  surcharge_per_kg: 500,
  fee_min: 6000,
  fee_max: 30000,
};

describe("computeShipping (linear)", () => {
  it("charges base only inside the free distance", () => {
    expect(computeShipping(cfg, 0.8, 5)).toEqual({
      base_delivery_fee: 5000,
      weight_surcharge: 0,
      final_shipping_cost: 6000, // clamped up to fee_min
      fee_floor: null,
      fee_cap: null,
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

describe("computeShipping (ds_v2)", () => {
  const ds = { ...cfg, pricing_model: "ds_v2" as const, fee_min: 0 };

  it.each([
    [0.25, 5000],
    [0.5, 5500],
    [1, 6000],
    [2, 7500],
    [3, 7500],
    [4, 7500],
    [4.25, 7833],
    [5, 8833],
    [6, 10167],
    [8, 12833],
    [10, 15500],
  ])("km %s → base_delivery_fee %s", (km, fee) => {
    expect(computeShipping(ds, km, 5).base_delivery_fee).toBe(fee);
  });

  it("still applies the weight surcharge and fee clamp on top of the ds_v2 base", () => {
    const q = computeShipping({ ...ds, fee_min: 8000 }, 2, 20.2);
    expect(q.base_delivery_fee).toBe(7500);
    expect(q.weight_surcharge).toBe(500);
    expect(q.final_shipping_cost).toBe(8000);
  });

  it("reports floor and cap for the snapshot", () => {
    const q = computeShipping(ds, 6, 5);
    expect(q.fee_floor).toBe(13500);
    expect(Math.round(q.fee_cap!)).toBe(10167);
  });
});

describe("courierWageFull", () => {
  it("is wage_base + wage_per_km × km in whole rupiah", () => {
    expect(courierWageFull(dsV2, 2.5)).toBe(7250);
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
