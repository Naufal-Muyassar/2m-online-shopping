import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CUSTOMER_STATUS_LABELS, CUSTOMER_TIMELINE, formatIDR, type OrderStatus } from "@2m/shared";
import { useOrder } from "../../lib/queries";
import { cn } from "../../lib/utils";
import { IconReceipt, IconStore } from "../../components/Icons";
import { ErrorCard, PageSkeleton } from "../../components/States";
import { StatusPill } from "../../components/StatusPill";
import { CourierChatButton } from "./CourierChatButton";
import { TrackingCard } from "./TrackingCard";
import { RefundSection } from "./RefundSection";

const LABEL = CUSTOMER_STATUS_LABELS;

// Dormant FIFO statuses sit in the picking step.
const STEP_OF: Partial<Record<OrderStatus, OrderStatus>> = { READY: "PICKING", ASSIGNED: "PICKING" };

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function MoneyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

// Straight back to the catalogue of the branch the customer last shopped at; the picker if there is none.
const shopAgainTo = () => {
  const branchId = localStorage.getItem("2m.last_branch");
  return branchId ? `/b/${branchId}` : "/";
};

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

  // Signed photo URLs (delivery proof, refund receipt) expire after 5 minutes: one refetch on a load error fetches a fresh one.
  const onImageError = () => {
    if (refetchedOnImageError.current) return;
    refetchedOnImageError.current = true;
    void refetch();
  };

  return (
    <main className="app-main">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-col gap-3">
          <p className="t-label">Pesanan · {order.branch_name}</p>
          <h1 className="t-headline tabular-nums">{order.code}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <StatusPill status={order.status} />
            {courier && <span className="text-sm text-muted-foreground">Kurir: {courier.first_name}</span>}
          </div>
        </div>
        {courier && <CourierChatButton orderId={order.id} label={`Chat ${courier.first_name}`} className="w-full shrink-0 sm:w-auto" />}
      </header>
      {failure && <p className="alert-box">{failure}</p>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1fr)_28rem]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* While the courier is on the way the map is the one thing that matters, so it leads. */}
          {data.tracking_available && (
            <TrackingCard
              orderId={order.id}
              orderCode={order.code}
              status={order.status}
              courierName={courier?.first_name ?? null}
              destination={{ label: address.label, street: address.street }}
            />
          )}

          <ol className="card animate-rise" aria-label="Status pesanan">
            {steps.map((s, i) => {
              const at = reachedAt.get(s);
              const done = isDone(s);
              const current = s === order.status || (!exit && s === (STEP_OF[order.status] ?? order.status));
              return (
                <li key={s} className="relative flex items-start gap-3.5 pb-5 last:pb-0">
                  {i < steps.length - 1 && (
                    <span aria-hidden="true" className={cn("absolute bottom-0 left-[0.3125rem] top-5 w-px", done ? "bg-foreground" : "bg-border")} />
                  )}
                  <span
                    className={cn(
                      "relative mt-1.5 size-[0.6875rem] shrink-0 rounded-full border",
                      done ? (exit === s ? "border-destructive bg-destructive" : "border-foreground bg-foreground") : "border-input bg-surface",
                      current && (exit === s ? "ring-4 ring-destructive-surface" : "ring-4 ring-primary-surface"),
                    )}
                  />
                  <div className={cn("flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3", !done && "text-muted-foreground", current && "font-extrabold")}>
                    <span>{LABEL[s]}</span>
                    {done && at && <span className="t-label tabular-nums">{fmtTime(at)}</span>}
                  </div>
                </li>
              );
            })}
          </ol>

          {order.status === "PENDING_PAYMENT" && (
            <div className="notice flex flex-col items-start gap-3">
              <p>Pesanan menunggu pembayaran.</p>
              {data.invoice_url && (
                <a href={data.invoice_url} className="btn btn-primary">
                  Bayar sekarang
                </a>
              )}
            </div>
          )}

          <RefundSection orderId={order.id} refunds={data.refunds} onImageError={onImageError} />

          {proof && (
            <section className="card animate-rise space-y-3 text-sm">
              <h2 className="t-title">Bukti pengantaran</h2>
              <button type="button" onClick={() => setZoom(true)} className="block w-full overflow-hidden rounded-md border border-border" aria-label="Perbesar foto">
                <img
                  src={proof.photo_url}
                  alt="Bukti pengantaran"
                  onError={onImageError}
                  className="max-h-72 w-full object-cover transition-transform duration-300 ease-settle hover:scale-[1.02]"
                />
              </button>
              <p className="t-label">Diambil {fmtTime(proof.taken_at)}</p>
            </section>
          )}
          {proof && zoom && (
            <div role="dialog" aria-label="Bukti pengantaran" onClick={() => setZoom(false)} className="dialog-backdrop">
              <img src={proof.photo_url} alt="Bukti pengantaran" onError={onImageError} className="max-h-full max-w-full animate-pop rounded-lg shadow-lg" />
            </div>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          <section className="card animate-rise text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="t-title">Ringkasan belanja</h2>
              <span className="t-label tabular-nums">{items.length} produk</span>
            </div>
            {/* Name on its own line, quantity × price under it: a four-column table was cramped in a side column. */}
            <ul className="mt-3 divide-y divide-border border-y border-border">
              {items.map((i, idx) => (
                <li key={idx} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{i.name}</p>
                    <p className="mt-0.5 text-muted-foreground tabular-nums">
                      {i.qty} {i.unit} × {formatIDR(i.unit_price)}
                    </p>
                  </div>
                  <span className="shrink-0 font-bold tabular-nums">{formatIDR(i.line_total)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 space-y-1.5">
              <MoneyRow label="Subtotal" value={formatIDR(pricing.subtotal)} />
              <MoneyRow
                label={`Ongkir${pricing.route_distance_km != null ? ` (${pricing.route_distance_km} km)` : ""}`}
                value={formatIDR(pricing.delivery_fee)}
              />
              {pricing.voucher_discount > 0 && <MoneyRow label="Diskon voucher" value={`-${formatIDR(pricing.voucher_discount)}`} />}
              {pricing.payment_fee > 0 && <MoneyRow label="Biaya pembayaran" value={formatIDR(pricing.payment_fee)} />}
            </div>
            <div className="card-footer flex items-baseline justify-between gap-3">
              <span className="t-title">Total</span>
              <span className="t-figure">{formatIDR(pricing.grand_total)}</span>
            </div>
          </section>

          <section className="card animate-rise text-sm">
            <h2 className="t-title">Pengiriman</h2>
            <dl className="mt-3 space-y-3">
              <div>
                <dt className="t-label">Penerima</dt>
                <dd className="mt-0.5 font-semibold">
                  {address.receiver_name} · <span className="tabular-nums">{address.receiver_phone}</span>
                </dd>
              </div>
              <div>
                <dt className="t-label">Alamat · {address.label}</dt>
                <dd className="mt-0.5 text-muted-foreground">
                  {address.street}
                  {address.rt_rw && `, RT/RW ${address.rt_rw}`}
                  {address.unit && `, ${address.unit}`}
                </dd>
              </div>
              {address.courier_note && (
                <div>
                  <dt className="t-label">Catatan untuk kurir</dt>
                  <dd className="note-rail mt-1 text-muted-foreground">{address.courier_note}</dd>
                </div>
              )}
            </dl>
            <dl className="card-footer flex items-baseline justify-between gap-3">
              <div>
                <dt className="t-label">Pembayaran</dt>
                <dd className="mt-0.5 font-semibold">{payment.method ?? "-"}</dd>
              </div>
              {payment.paid_at && <dd className="t-label text-right tabular-nums">Dibayar {fmtTime(payment.paid_at)}</dd>}
            </dl>
          </section>
        </aside>
      </div>

      {/* Two equal keys on a phone, a right-aligned pair from sm. "Belanja lagi" is the primary
          unless "Bayar sekarang" above already is. */}
      <nav aria-label="Lanjutan" className="grid grid-cols-2 gap-3 border-t border-border pt-4 sm:flex sm:justify-end">
        <Link to="/orders" className="btn btn-secondary">
          <IconReceipt />
          Pesanan saya
        </Link>
        <Link to={shopAgainTo()} className={cn("btn", order.status === "PENDING_PAYMENT" ? "btn-secondary" : "btn-primary")}>
          <IconStore />
          Belanja lagi
        </Link>
      </nav>
    </main>
  );
}
