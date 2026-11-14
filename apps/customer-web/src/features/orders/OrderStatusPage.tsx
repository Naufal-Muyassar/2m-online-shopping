import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CUSTOMER_STATUS_LABELS, CUSTOMER_TIMELINE, formatIDR, type OrderStatus } from "@2m/shared";
import { errorMessage } from "../../lib/api";
import { useChatThreads, useOpenChat, useOrder } from "../../lib/queries";
import { useToast } from "../../lib/toast";
import { cn } from "../../lib/utils";
import { IconChat } from "../../components/Icons";
import { ErrorCard, PageSkeleton } from "../../components/States";
import { StatusPill } from "../../components/StatusPill";
import { TrackingCard } from "./TrackingCard";

const LABEL = CUSTOMER_STATUS_LABELS;

// Dormant FIFO statuses sit in the picking step.
const STEP_OF: Partial<Record<OrderStatus, OrderStatus>> = { READY: "PICKING", ASSIGNED: "PICKING" };

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function CourierChatButton({ orderId, courierName }: { orderId: string; courierName: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const open = useOpenChat();
  const unread = useChatThreads("customer_courier").data?.find((t) => t.order_id === orderId)?.unread_count ?? 0;

  return (
    <button
      type="button"
      disabled={open.isPending}
      onClick={() =>
        open.mutate(
          { channel: "customer_courier", order_id: orderId },
          { onSuccess: (t) => navigate(`/chat/${t.id}`), onError: (e) => toast("error", errorMessage(e)) },
        )
      }
      className="btn btn-secondary w-full sm:w-auto sm:self-start"
    >
      <IconChat className="text-lg" />
      Chat {courierName}
      {unread > 0 && <span className="count-badge static">{unread}</span>}
    </button>
  );
}

function MoneyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

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
      <header className="flex flex-col gap-3">
        <p className="t-label">Pesanan · {order.branch_name}</p>
        <h1 className="t-headline tabular-nums">{order.code}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <StatusPill status={order.status} />
          {courier && <span className="text-sm text-muted-foreground">Kurir: {courier.first_name}</span>}
        </div>
        {courier && <CourierChatButton orderId={order.id} courierName={courier.first_name} />}
        {failure && <p className="alert-box">{failure}</p>}
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-8">
        <div className="flex min-w-0 flex-col gap-5">
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

          {data.tracking_available && <TrackingCard orderId={order.id} />}

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

        <div className="flex min-w-0 flex-col gap-5">
          <section className="card animate-rise text-sm">
            <h2 className="t-title mb-3">Barang</h2>
            <table className="w-full">
              <thead className="text-left">
                <tr className="border-b border-foreground">
                  <th className="t-label pb-2">Nama</th>
                  <th className="t-label pb-2 text-right">Jumlah</th>
                  <th className="t-label hidden pb-2 text-right sm:table-cell">Harga</th>
                  <th className="t-label pb-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((i, idx) => (
                  <tr key={idx} className="align-top">
                    <td className="py-2 pr-2 font-medium">{i.name}</td>
                    <td className="whitespace-nowrap py-2 pl-2 text-right tabular-nums">
                      {i.qty} {i.unit}
                    </td>
                    <td className="hidden whitespace-nowrap py-2 pl-2 text-right tabular-nums sm:table-cell">{formatIDR(i.unit_price)}</td>
                    <td className="whitespace-nowrap py-2 pl-2 text-right font-semibold tabular-nums">{formatIDR(i.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="card-footer space-y-1.5">
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

          <section className="card animate-rise space-y-1.5 text-sm">
            <h2 className="t-title mb-2">Alamat pengiriman</h2>
            <p className="font-semibold">
              {address.receiver_name} · {address.receiver_phone}
            </p>
            <p className="text-muted-foreground">
              {address.label}: {address.street}
              {address.rt_rw && `, RT/RW ${address.rt_rw}`}
              {address.unit && `, ${address.unit}`}
            </p>
            {address.courier_note && <p className="note-rail !mt-3 text-muted-foreground">Catatan: {address.courier_note}</p>}
          </section>

          <section className="card animate-rise space-y-1.5 text-sm">
            <h2 className="t-title mb-2">Pembayaran</h2>
            <p className="font-semibold">{payment.method ?? "-"}</p>
            {payment.paid_at && <p className="text-muted-foreground">Dibayar {fmtTime(payment.paid_at)}</p>}
          </section>
        </div>
      </div>

      <div className="flex justify-between border-t border-border pt-2 text-sm">
        <Link to="/orders" className="link">
          Pesanan saya
        </Link>
        <Link to="/" className="link">
          Belanja lagi
        </Link>
      </div>
    </main>
  );
}
