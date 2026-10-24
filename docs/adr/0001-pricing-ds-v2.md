# ADR 0001 — Pricing model ds_v2

Status: accepted for the demo. Source: `Draft_DS_Kurir_v2.xlsx` (sheets Parameter, T4_Grid_Jarak). Selectable per branch via `branch_pricing_config.pricing_model` (`ds_v2` | `linear`).

km = route one-way distance = Haversine × `circuity_factor`, 2 decimals.

```
wage_full  = wage_base + wage_per_km × km
wage_eff   = wage_full × (1 − failed_rate × (1 − failed_pay_fraction))
cost_branch = overhead_per_day / drops_per_day
fee_floor  = ceil_to(round_to, (wage_eff + cost_branch) / (1 − failed_rate × (1 − failed_fee_charged_fraction)))
fee_cap    = cap_min_fee + cap_per_km × max(0, km − cap_free_km)
base_delivery_fee = round(min(fee_floor, fee_cap))
```

The weight surcharge, voucher and `fee_min`/`fee_max` clamp run after this, unchanged. All parameters live in `branch_pricing_config`, so they change without a deploy.

Courier pay: `orders.courier_wage` = `round(wage_full)`; `courier_pay_final` = full on DELIVERED, `round(courier_wage × failed_pay_fraction)` on FAILED. Motor clusters (`motor_clusters`) are reference data only and never affect the customer fee.

Open PM point: 2M loses money from about 2.25 km at the current wage hypothesis (the fee cap falls below wage + branch cost).
