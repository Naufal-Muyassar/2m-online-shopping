import type { FeeTier, PricingConfig } from "../cart/repo";

export interface ShippingQuote {
  base_delivery_fee: number;
  weight_surcharge: number;
  final_shipping_cost: number;
  fee_floor: number | null;
  fee_cap: number | null;
}

export interface PaymentFeeConfig {
  absorbed: boolean;
  fee_flat: number;
  fee_percent: number;
}

type DsV2Config = Pick<
  PricingConfig,
  | "wage_base"
  | "wage_per_km"
  | "failed_rate"
  | "failed_pay_fraction"
  | "failed_fee_charged_fraction"
  | "overhead_per_day"
  | "drops_per_day"
  | "round_to"
  | "cap_min_fee"
  | "cap_free_km"
  | "cap_per_km"
>;

type TieredConfig = Pick<PricingConfig, "fee_tiers" | "tier_extra_per_km" | "round_to">;

type ShippingConfig = Pick<
  PricingConfig,
  "pricing_model" | "base_fee" | "per_km" | "free_km" | "weight_threshold_kg" | "surcharge_per_kg" | "fee_min" | "fee_max"
> &
  DsV2Config &
  TieredConfig;

// Courier pay for one drop, before the failed-delivery adjustment.
export function courierWageFull(cfg: Pick<DsV2Config, "wage_base" | "wage_per_km">, km: number): number {
  return Math.round(cfg.wage_base + cfg.wage_per_km * km);
}

// Draft_DS_Kurir_v2.xlsx (Parameter, T4_Grid_Jarak): cost-plus floor, capped by the distance grid.
export function computeDsV2Base(cfg: DsV2Config, km: number): { base: number; floor: number; cap: number } {
  const wageFull = cfg.wage_base + cfg.wage_per_km * km;
  const wageEff = wageFull * (1 - cfg.failed_rate * (1 - cfg.failed_pay_fraction));
  const costBranch = cfg.overhead_per_day / cfg.drops_per_day;
  const raw = (wageEff + costBranch) / (1 - cfg.failed_rate * (1 - cfg.failed_fee_charged_fraction));
  const floor = Math.ceil(raw / cfg.round_to) * cfg.round_to;
  const cap = cfg.cap_min_fee + cfg.cap_per_km * Math.max(0, km - cfg.cap_free_km);
  return { base: Math.round(Math.min(floor, cap)), floor, cap };
}

// Owner's tier table (2026-11-26): a flat fee per one-way route distance tier; past the last tier, the last fee plus
// tier_extra_per_km for every further km, rounded to the nearest round_to. Tiers are sorted by max_km here, so the
// stored order does not matter.
export function computeTieredBase(cfg: TieredConfig, km: number): number {
  const tiers: FeeTier[] = [...cfg.fee_tiers].sort((a, b) => a.max_km - b.max_km);
  const hit = tiers.find((t) => km <= t.max_km);
  if (hit) return hit.fee;
  const last = tiers[tiers.length - 1]!;
  const raw = last.fee + cfg.tier_extra_per_km * (km - last.max_km);
  return Math.round(raw / cfg.round_to) * cfg.round_to;
}

export function computeShipping(cfg: ShippingConfig, distanceKm: number, weightKg: number): ShippingQuote {
  const ds = cfg.pricing_model === "ds_v2" ? computeDsV2Base(cfg, distanceKm) : null;
  const baseDeliveryFee = ds
    ? ds.base
    : cfg.pricing_model === "tiered"
      ? computeTieredBase(cfg, distanceKm)
      : cfg.base_fee + Math.round(cfg.per_km * Math.max(0, distanceKm - cfg.free_km));
  const weightSurcharge = Math.ceil(Math.max(0, weightKg - cfg.weight_threshold_kg)) * cfg.surcharge_per_kg;
  const finalShippingCost = Math.min(cfg.fee_max, Math.max(cfg.fee_min, baseDeliveryFee + weightSurcharge));
  return {
    base_delivery_fee: baseDeliveryFee,
    weight_surcharge: weightSurcharge,
    final_shipping_cost: finalShippingCost,
    fee_floor: ds?.floor ?? null,
    fee_cap: ds?.cap ?? null,
  };
}

export function computePaymentFee(cfg: PaymentFeeConfig, chargeable: number): number {
  if (cfg.absorbed) return 0;
  return cfg.fee_flat + Math.round((chargeable * cfg.fee_percent) / 100);
}
