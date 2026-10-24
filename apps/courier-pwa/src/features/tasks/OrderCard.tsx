import { Link } from "react-router-dom";
import type { CourierOrder } from "@2m/shared";
import { FaChevronRight } from "react-icons/fa";

export const STATUS_LABELS: Record<string, string> = {
  PICKING: "Sedang disiapkan",
  ON_DELIVERY: "Dalam perjalanan",
  DELIVERED: "Terkirim",
  FAILED: "Gagal kirim",
};

export function OrderCard({ order }: { order: CourierOrder }) {
  const returning = order.status === "FAILED" && order.return_pending;
  return (
    <Link to={`/orders/${order.id}`} className="block rounded-xl border border-border p-4 active:bg-muted">
      <div className="flex items-center justify-between gap-2">
        <span className="text-lg font-bold">{order.code}</span>
        <span className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-sm font-medium">
          {STATUS_LABELS[order.status] ?? order.status}
          <FaChevronRight aria-hidden="true" className="text-xs" />
        </span>
      </div>
      <p className="mt-1 text-base">{order.address.receiver_name}</p>
      <p className="text-sm text-muted-foreground">{order.address.street}</p>
      {returning && (
        <p className="mt-2 rounded-lg bg-destructive/10 p-2 text-sm font-medium text-destructive">
          Kembalikan barang ke cabang – menunggu konfirmasi admin
        </p>
      )}
    </Link>
  );
}
