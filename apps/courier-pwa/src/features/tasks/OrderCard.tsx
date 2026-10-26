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
      style={{ animationDelay: `${Math.min(index, 6) * 70}ms` } as CSSProperties}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-lg font-bold">{order.code}</span>
        <span className={`pill pill-dot ${STATUS_PILLS[order.status] ?? ""}`}>{STATUS_LABELS[order.status] ?? order.status}</span>
      </div>
      <p className="mt-2 text-base font-medium">{order.address.receiver_name}</p>
      <p className="line-clamp-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">{order.address.street}</p>
      {returning && (
        <p className="alert-box mt-3 font-medium">Kembalikan barang ke cabang – menunggu konfirmasi admin</p>
      )}
      <div className="card-footer flex items-center justify-end text-primary">
        <span className="flex size-10 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
          <FaChevronRight aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}
