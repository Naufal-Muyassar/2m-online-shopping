import type { PricingConfig } from "../cart/repo";

export interface ShippingQuote {
  base_delivery_fee: number;
  weight_surcharge: number;
  final_shipping_cost: number;
}

export interface PaymentFeeConfig {
  absorbed: boolean;
  fee_flat: number;
  fee_percent: number;
}

type ShippingConfig = Pick<
  PricingConfig,
  "base_fee" | "per_km" | "free_km" | "weight_threshold_kg" | "surcharge_per_kg" | "fee_min" | "fee_max"
>;

export function computeShipping(cfg: ShippingConfig, distanceKm: number, weightKg: number): ShippingQuote {
  const baseDeliveryFee = cfg.base_fee + Math.round(cfg.per_km * Math.max(0, distanceKm - cfg.free_km));
  const weightSurcharge = Math.ceil(Math.max(0, weightKg - cfg.weight_threshold_kg)) * cfg.surcharge_per_kg;
  const finalShippingCost = Math.min(cfg.fee_max, Math.max(cfg.fee_min, baseDeliveryFee + weightSurcharge));
  return {
    base_delivery_fee: baseDeliveryFee,
    weight_surcharge: weightSurcharge,
    final_shipping_cost: finalShippingCost,
  };
}

export function computePaymentFee(cfg: PaymentFeeConfig, chargeable: number): number {
  if (cfg.absorbed) return 0;
  return cfg.fee_flat + Math.round((chargeable * cfg.fee_percent) / 100);
}
