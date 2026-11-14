import { Link } from "react-router-dom";
import type { CSSProperties } from "react";
import type { CourierOrder } from "@2m/shared";
import { FaChevronRight } from "react-icons/fa";

export const STATUS_LABELS: Record<string, string> = {
  PICKING: "Sedang disiapkan",
  ON_DELIVERY: "Dalam perjalanan",
  DELIVERED: "Terkirim",
  FAILED: "Gagal kirim",
};

export const STATUS_PILLS: Record<string, string> = {
  PICKING: "pill-warning",
  ON_DELIVERY: "pill-primary",
  DELIVERED: "pill-success",
  FAILED: "pill-danger",
};

export function OrderCard({ order, index = 0 }: { order: CourierOrder; index?: number }) {
  const returning = order.status === "FAILED" && order.return_pending;
  return (
    <Link
      to={`/orders/${order.id}`}
      className="card card-link animate-rise"
      style={{ animationDelay: `${Math.min(index, 6) * 60}ms` } as CSSProperties}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-lg font-extrabold tabular-nums tracking-tight">{order.code}</span>
        <span className={`pill pill-dot ${STATUS_PILLS[order.status] ?? ""}`}>{STATUS_LABELS[order.status] ?? order.status}</span>
      </div>
      <div className="mt-3 flex items-end gap-3 border-t border-border pt-3">
        <div className="min-w-0 flex-1">
          <p className="font-bold">{order.address.receiver_name}</p>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">{order.address.street}</p>
        </div>
        <FaChevronRight aria-hidden="true" className="row-arrow mb-1 text-xs" />
      </div>
      {returning && <p className="alert-box mt-3">Kembalikan barang ke cabang – menunggu konfirmasi admin</p>}
    </Link>
  );
}
