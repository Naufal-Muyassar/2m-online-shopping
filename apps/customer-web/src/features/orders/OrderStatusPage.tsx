import { Link, useParams } from "react-router-dom";
import { CUSTOMER_STATUS_LABELS, CUSTOMER_TIMELINE, formatIDR, type OrderStatus } from "@2m/shared";
import { useOrder } from "../../lib/queries";
import { cn } from "../../lib/utils";

const LABEL = CUSTOMER_STATUS_LABELS;

// Dormant FIFO statuses sit in the picking step.
const STEP_OF: Partial<Record<OrderStatus, OrderStatus>> = { READY: "PICKING", ASSIGNED: "PICKING" };

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function OrderStatusPage() {
  const { orderId = "" } = useParams();
  const { data: order, isLoading, isError } = useOrder(orderId);

  if (isLoading) return <p className="p-4 text-sm text-muted-foreground">Memuat…</p>;
  if (isError || !order) return <p className="p-4 text-sm text-destructive">Pesanan tidak ditemukan.</p>;

  const reachedAt = new Map<OrderStatus, string>();
  for (const t of order.timeline) reachedAt.set(t.status, t.at);
  const exit = order.status === "FAILED" || order.status === "CANCELLED" ? order.status : null;
  const stepIdx = CUSTOMER_TIMELINE.indexOf(STEP_OF[order.status] ?? order.status);
  // A cancelled or failed order keeps only the steps it actually reached; otherwise the timeline fills up to the current step.
  const steps: OrderStatus[] = exit
    ? [...CUSTOMER_TIMELINE.filter((s) => reachedAt.has(s)), exit]
    : [...CUSTOMER_TIMELINE];
  const isDone = (s: OrderStatus) => (exit ? reachedAt.has(s) || s === exit : CUSTOMER_TIMELINE.indexOf(s) <= stepIdx);

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <div>
        <p className="text-sm text-muted-foreground">Pesanan</p>
        <h1 className="text-xl font-semibold">{order.code}</h1>
        <p className="text-sm">{LABEL[order.status]}</p>
        {order.courier_first_name && <p className="text-sm text-muted-foreground">Kurir: {order.courier_first_name}</p>}
      </div>

      <ol className="space-y-3 rounded-lg border p-4" aria-label="Status pesanan">
        {steps.map((s) => {
          const at = reachedAt.get(s);
          const done = isDone(s);
          const current = s === order.status || (!exit && s === (STEP_OF[order.status] ?? order.status));
          return (
            <li key={s} className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-1 h-3 w-3 shrink-0 rounded-full border",
                  done ? (exit === s ? "border-destructive bg-destructive" : "border-primary bg-primary") : "bg-background",
                )}
              />
              <div className={cn("text-sm", !done && "text-muted-foreground", current && "font-semibold")}>
                {LABEL[s]}
                {done && at && <span className="ml-2 text-xs font-normal text-muted-foreground">{fmtTime(at)}</span>}
              </div>
            </li>
          );
        })}
      </ol>

      {order.status === "PENDING_PAYMENT" && (
        <div className="space-y-2 rounded-lg bg-secondary p-3 text-sm">
          <p>Pesanan menunggu pembayaran.</p>
          {order.invoice_url && (
            <a href={order.invoice_url} className="inline-block rounded-md bg-primary px-3 py-2 text-primary-foreground">
              Bayar sekarang
            </a>
          )}
        </div>
      )}

      <section className="space-y-1 rounded-lg border p-4 text-sm">
        {order.items.map((i) => (
          <div key={i.sku} className="flex justify-between">
            <span>
              {i.qty} × {i.name}
            </span>
            <span>{formatIDR(i.unit_price * i.qty)}</span>
          </div>
        ))}
        <hr className="my-2" />
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatIDR(order.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>Ongkir</span>
          <span>{formatIDR(order.delivery_fee)}</span>
        </div>
        {order.payment_fee > 0 && (
          <div className="flex justify-between">
            <span>Biaya pembayaran</span>
            <span>{formatIDR(order.payment_fee)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold">
          <span>Total</span>
          <span>{formatIDR(order.grand_total)}</span>
        </div>
      </section>
      <Link to="/" className="block text-center text-sm text-primary">
        Belanja lagi
      </Link>
    </main>
  );
}
