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
      <main className="app-main">
        <div className="page-narrow flex animate-rise flex-col items-start gap-4 py-6 md:py-12">
          <span className="empty-state-icon bg-destructive-surface text-destructive">
            <IconAlert />
          </span>
          <h1 className="t-headline">Pembayaran tidak berhasil</h1>
          <p className="text-muted-foreground">Pesanan {order.code} dibatalkan karena pembayaran kedaluwarsa atau gagal.</p>
          <div className="flex flex-wrap gap-x-6">
            <Link to={`/orders/${order.id}`} className="link">
              Lihat detail pesanan
            </Link>
            <Link to="/" className="link">
              Belanja lagi
            </Link>
          </div>
        </div>
      </main>
    );
  }
  if (order.status !== "PENDING_PAYMENT") return <Navigate to={`/orders/${order.id}`} replace />;

  return (
    <main className="app-main" aria-live="polite">
      <div className="page-narrow flex animate-rise flex-col items-start gap-4 py-6 md:py-12">
        <div className="skeleton size-12" aria-hidden="true" />
        <h1 className="t-headline">Memverifikasi pembayaran…</h1>
        <p className="text-muted-foreground">Jangan tutup halaman ini. Status pesanan {order.code} diperbarui otomatis.</p>
        <Link to={`/orders/${order.id}`} className="link">
          Lihat detail pesanan
        </Link>
      </div>
    </main>
  );
}
