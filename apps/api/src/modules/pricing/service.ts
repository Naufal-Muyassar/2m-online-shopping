import type { Pool } from "pg";
import type { Address, CalculatePriceRequest, PriceBreakdown } from "@2m/shared";
import type { Tx } from "../../shared/db";
import { AppError } from "../../shared/errors";
import { haversineM } from "../../shared/geo";
import * as addressRepo from "../address/repo";
import { assertInCoverage } from "../address/service";
import { stockProvider } from "../catalog/stock";
import * as cartRepo from "../cart/repo";
import { requireBranchConfig, toCart, totalsOf, validateLines } from "../cart/service";
import { computePaymentFee, computeShipping, courierWageFull, type PaymentFeeConfig } from "./calc";

type Db = Pool | Tx;

export interface Quote {
  cartId: string;
  lines: cartRepo.CartLine[];
  address: Address;
  breakdown: PriceBreakdown;
  isBulkOrder: boolean;
  snapshotExtra: Record<string, unknown>;
  courierWage: number;
}

async function paymentFeeConfig(db: Db, method: string): Promise<PaymentFeeConfig> {
  const res = await db.query<PaymentFeeConfig>(
    "SELECT absorbed, fee_flat, fee_percent::float8 AS fee_percent FROM payment_fee_config WHERE payment_method = $1",
    [method],
  );
  const row = res.rows[0];
  if (!row) throw new AppError(400, "INVALID_PAYMENT_METHOD", "Payment method is not available");
  return row;
}

// Pass a Tx plus lockCart to serialise against concurrent cart edits while creating an order.
export async function quote(
  db: Db,
  userId: string,
  req: CalculatePriceRequest,
  opts: { lockCart?: boolean } = {},
): Promise<Quote> {
  if (req.voucher_code) throw new AppError(400, "VOUCHER_UNSUPPORTED", "Vouchers are not supported yet");

  const { limits, pricing } = await requireBranchConfig(db, req.branch_id);
  const address = await addressRepo.find(db, userId, req.address_id);
  if (!address) throw new AppError(404, "ADDRESS_NOT_FOUND", "Address not found");
  await assertInCoverage(db, req.branch_id, address.lat, address.lng);

  const cartId = opts.lockCart
    ? await cartRepo.lockOrCreateCart(db as Tx, userId, req.branch_id)
    : await cartRepo.findCartId(db, userId, req.branch_id);
  const lines = cartId ? await cartRepo.getLines(db, cartId, req.branch_id) : [];
  if (!cartId || lines.length === 0) throw new AppError(409, "CART_EMPTY", "Cart is empty");
  if (lines.length !== (await cartRepo.countItems(db, cartId))) {
    throw new AppError(409, "PRODUCT_UNAVAILABLE", "Some cart items are no longer sold by this branch");
  }
  validateLines(limits, lines);

  const stock = await stockProvider.statusFor(req.branch_id, lines.map((l) => l.product_id), db);
  const outLines = lines.filter((l) => stock.get(l.product_id) === "out");
  if (outLines.length > 0) {
    throw new AppError(409, "OUT_OF_STOCK", "Product is out of stock", {
      product: outLines[0]!.name,
      skus: outLines.map((l) => l.sku),
    });
  }

  const { subtotal, weightKg } = totalsOf(lines);
  if (subtotal < pricing.min_order) {
    throw new AppError(409, "MIN_ORDER_NOT_MET", `Minimum order is Rp${pricing.min_order}`, { min_order: pricing.min_order });
  }

  const branch = (await addressRepo.branchGeo(db, req.branch_id))!;
  const distanceKm = Math.round(((haversineM(branch.lat, branch.lng, address.lat, address.lng) * pricing.circuity_factor) / 1000) * 100) / 100;
  const shipping = computeShipping(pricing, distanceKm, weightKg);
  const { fee_floor: feeFloor, fee_cap: feeCap, ...shippingFees } = shipping;
  const wageFull = courierWageFull(pricing, distanceKm);
  const voucherDiscount = 0;
  const paymentFee = computePaymentFee(await paymentFeeConfig(db, req.payment_method), subtotal + shipping.final_shipping_cost);

  return {
    cartId,
    lines,
    address,
    isBulkOrder: toCart(req.branch_id, lines, limits, pricing.min_order).is_bulk_order,
    // Internal cost data: stored on the order, never sent to the customer.
    snapshotExtra: {
      route_distance_km: distanceKm,
      fee_floor: feeFloor,
      fee_cap: feeCap,
      courier_wage: {
        scheme_version: "ds_v2",
        wage_base: pricing.wage_base,
        wage_per_km: pricing.wage_per_km,
        route_km: distanceKm,
        full: wageFull,
        failed_pay_fraction: pricing.failed_pay_fraction,
      },
    },
    courierWage: wageFull,
    breakdown: {
      subtotal,
      ...shippingFees,
      voucher_discount: voucherDiscount,
      payment_fee: paymentFee,
      grand_total: subtotal + shipping.final_shipping_cost - voucherDiscount + paymentFee,
      distance_km: distanceKm,
      route_distance_km: distanceKm,
      total_weight_kg: weightKg,
    },
  };
}
