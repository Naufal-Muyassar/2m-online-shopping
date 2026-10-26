import { Link, Navigate, useParams } from "react-router-dom";
import { useOrder } from "../../lib/queries";
import { IconAlert } from "../../components/Icons";
import { ErrorCard, PageSkeleton } from "../../components/States";

// Xendit sends the customer here after the hosted page. The redirect proves nothing: the page only shows what the
// API reports, polling until the webhook (or reconciliation) has moved the order out of PENDING_PAYMENT.
export function PaymentReturnPage() {
  const { orderId = "" } = useParams();
  const { data, isError } = useOrder(orderId, 3_000);

  if (isError) {
    return (
      <main className="app-main">
        <ErrorCard message="Pesanan tidak ditemukan." />
      </main>
    );
  }
  if (!data) return <PageSkeleton />;
  const order = data.order;

  if (order.status === "CANCELLED") {
    return (
      <main className="app-main items-center text-center">
        <span className="empty-state-icon">
          <IconAlert />
        </span>
        <h1 className="text-2xl font-bold">Pembayaran tidak berhasil</h1>
        <p className="text-sm text-muted-foreground">Pesanan {order.code} dibatalkan karena pembayaran kedaluwarsa atau gagal.</p>
        <Link to={`/orders/${order.id}`} className="inline-flex min-h-11 items-center font-medium text-accent">
          Lihat detail pesanan
        </Link>
        <Link to="/" className="inline-flex min-h-11 items-center font-medium text-accent">
          Belanja lagi
        </Link>
      </main>
    );
  }
  if (order.status !== "PENDING_PAYMENT") return <Navigate to={`/orders/${order.id}`} replace />;

  return (
    <main className="app-main items-center text-center" aria-live="polite">
      <div className="skeleton h-14 w-14 rounded-full" aria-hidden="true" />
      <h1 className="text-2xl font-bold">Memverifikasi pembayaran…</h1>
      <p className="text-sm text-muted-foreground">Jangan tutup halaman ini. Status pesanan {order.code} diperbarui otomatis.</p>
      <Link to={`/orders/${order.id}`} className="inline-flex min-h-11 items-center font-medium text-accent">
        Lihat detail pesanan
      </Link>
    </main>
  );
}
