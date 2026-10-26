import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CUSTOMER_STATUS_LABELS, CUSTOMER_TIMELINE, formatIDR, type OrderStatus } from "@2m/shared";
import { useOrder } from "../../lib/queries";
import { cn } from "../../lib/utils";
import { ErrorCard, PageSkeleton } from "../../components/States";
import { StatusPill } from "../../components/StatusPill";
import { TrackingCard } from "./TrackingCard";

const LABEL = CUSTOMER_STATUS_LABELS;

// Dormant FIFO statuses sit in the picking step.
const STEP_OF: Partial<Record<OrderStatus, OrderStatus>> = { READY: "PICKING", ASSIGNED: "PICKING" };

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function OrderStatusPage() {
  const { orderId = "" } = useParams();
  const { data, isLoading, isError, refetch } = useOrder(orderId);
  const [zoom, setZoom] = useState(false);
  const refetchedOnImageError = useRef(false);

  if (isLoading) return <PageSkeleton />;
  if (isError || !data) {
    return (
      <main className="app-main">
        <ErrorCard message="Pesanan tidak ditemukan." onRetry={() => void refetch()} />
      </main>
    );
  }

  const { order, items, pricing, address, payment, timeline, courier, failure, proof } = data;
  const reachedAt = new Map<OrderStatus, string>();
  for (const t of timeline) reachedAt.set(t.status, t.at);
  const exit = order.status === "FAILED" || order.status === "CANCELLED" ? order.status : null;
  const stepIdx = CUSTOMER_TIMELINE.indexOf(STEP_OF[order.status] ?? order.status);
  // A cancelled or failed order keeps only the steps it actually reached; otherwise the timeline fills up to the current step.
  const steps: OrderStatus[] = exit
    ? [...CUSTOMER_TIMELINE.filter((s) => reachedAt.has(s)), exit]
    : [...CUSTOMER_TIMELINE];
  const isDone = (s: OrderStatus) => (exit ? reachedAt.has(s) || s === exit : CUSTOMER_TIMELINE.indexOf(s) <= stepIdx);

  // The signed photo URL expires after 5 minutes: one refetch on a load error fetches a fresh one.
  const onImageError = () => {
    if (refetchedOnImageError.current) return;
    refetchedOnImageError.current = true;
    void refetch();
  };

  return (
    <main className="app-main">
      <div className="space-y-1">
        <p className="eyebrow">Pesanan · {order.branch_name}</p>
        <h1 className="text-2xl font-bold">{order.code}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={order.status} />
          {courier && <span className="text-sm text-muted-foreground">Kurir: {courier.first_name}</span>}
        </div>
        {failure && <p className="alert-box mt-2">{failure}</p>}
      </div>

      <ol className="card animate-rise space-y-3" aria-label="Status pesanan">
        {steps.map((s) => {
          const at = reachedAt.get(s);
          const done = isDone(s);
          const current = s === order.status || (!exit && s === (STEP_OF[order.status] ?? order.status));
          return (
            <li key={s} className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-1 h-3 w-3 shrink-0 rounded-full border",
                  done ? (exit === s ? "border-destructive bg-destructive" : "border-primary bg-primary") : "border-border bg-surface",
                  current && "ring-4 ring-primary-surface",
                )}
              />
              <div className={cn("text-sm", !done && "text-muted-foreground", current && "font-bold")}>
                {LABEL[s]}
                {done && at && <span className="ml-2 text-xs font-normal text-muted-foreground">{fmtTime(at)}</span>}
              </div>
            </li>
          );
        })}
      </ol>

      {order.status === "PENDING_PAYMENT" && (
        <div className="notice flex flex-col items-start gap-3">
          <p>Pesanan menunggu pembayaran.</p>
          {data.invoice_url && (
            <a href={data.invoice_url} className="btn-hero">
              Bayar sekarang
            </a>
          )}
        </div>
      )}

      {data.tracking_available && <TrackingCard orderId={order.id} />}

      {proof && (
        <section className="card animate-rise space-y-2 text-sm">
          <h2 className="text-base font-bold">Bukti pengantaran</h2>
          <button type="button" onClick={() => setZoom(true)} className="block w-full" aria-label="Perbesar foto">
            <img
              src={proof.photo_url}
              alt="Bukti pengantaran"
              onError={onImageError}
              className="max-h-64 w-full rounded-md object-cover"
            />
          </button>
          <p className="text-xs text-muted-foreground">Diambil {fmtTime(proof.taken_at)}</p>
        </section>
      )}
      {proof && zoom && (
        <div
          role="dialog"
          aria-label="Bukti pengantaran"
          onClick={() => setZoom(false)}
          className="sheet-backdrop items-center p-4"
        >
          <img src={proof.photo_url} alt="Bukti pengantaran" onError={onImageError} className="max-h-full max-w-full rounded-lg shadow-lg" />
        </div>
      )}

      <section className="card animate-rise text-sm">
        <h2 className="mb-2 text-base font-bold">Barang</h2>
        <table className="w-full">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="font-normal">Nama</th>
              <th className="text-right font-normal">Jumlah</th>
              <th className="text-right font-normal">Harga</th>
              <th className="text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i, idx) => (
              <tr key={idx} className="align-top">
                <td className="py-1">{i.name}</td>
                <td className="py-1 text-right">
                  {i.qty} {i.unit}
                </td>
                <td className="py-1 text-right">{formatIDR(i.unit_price)}</td>
                <td className="py-1 text-right">{formatIDR(i.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card animate-rise space-y-1 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatIDR(pricing.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>Ongkir{pricing.route_distance_km != null && ` (${pricing.route_distance_km} km)`}</span>
          <span>{formatIDR(pricing.delivery_fee)}</span>
        </div>
        {pricing.voucher_discount > 0 && (
          <div className="flex justify-between">
            <span>Diskon voucher</span>
            <span>-{formatIDR(pricing.voucher_discount)}</span>
          </div>
        )}
        {pricing.payment_fee > 0 && (
          <div className="flex justify-between">
            <span>Biaya pembayaran</span>
            <span>{formatIDR(pricing.payment_fee)}</span>
          </div>
        )}
        <div className="card-footer flex justify-between text-lg font-bold">
          <span>Total</span>
          <span>{formatIDR(pricing.grand_total)}</span>
        </div>
      </section>

      <section className="card animate-rise space-y-1 text-sm">
        <h2 className="text-base font-bold">Alamat pengiriman</h2>
        <p>
          {address.receiver_name} · {address.receiver_phone}
        </p>
        <p className="text-muted-foreground">
          {address.label}: {address.street}
          {address.rt_rw && `, RT/RW ${address.rt_rw}`}
          {address.unit && `, ${address.unit}`}
        </p>
        {address.courier_note && <p className="note-rail text-muted-foreground">Catatan: {address.courier_note}</p>}
      </section>

      <section className="card animate-rise space-y-1 text-sm">
        <h2 className="text-base font-bold">Pembayaran</h2>
        <p>{payment.method ?? "-"}</p>
        {payment.paid_at && <p className="text-muted-foreground">Dibayar {fmtTime(payment.paid_at)}</p>}
      </section>

      <div className="flex justify-between text-sm">
        <Link to="/orders" className="inline-flex min-h-11 items-center font-medium text-accent">
          Pesanan saya
        </Link>
        <Link to="/" className="inline-flex min-h-11 items-center font-medium text-accent">
          Belanja lagi
        </Link>
      </div>
    </main>
  );
}
