import { Link, Navigate, useParams } from "react-router-dom";
import { useOrder } from "../../lib/queries";

// Xendit sends the customer here after the hosted page. The redirect proves nothing: the page only shows what the
// API reports, polling until the webhook (or reconciliation) has moved the order out of PENDING_PAYMENT.
export function PaymentReturnPage() {
  const { orderId = "" } = useParams();
  const { data, isError } = useOrder(orderId, 3_000);

  if (isError) return <p className="p-4 text-sm text-destructive">Pesanan tidak ditemukan.</p>;
  if (!data) return <p className="p-4 text-sm text-muted-foreground">Memuat…</p>;
  const order = data.order;

  if (order.status === "CANCELLED") {
    return (
      <main className="mx-auto max-w-2xl space-y-3 p-4 text-center">
        <h1 className="text-xl font-semibold">Pembayaran tidak berhasil</h1>
        <p className="text-sm text-muted-foreground">Pesanan {order.code} dibatalkan karena pembayaran kedaluwarsa atau gagal.</p>
        <Link to={`/orders/${order.id}`} className="block text-sm text-primary">
          Lihat detail pesanan
        </Link>
        <Link to="/" className="text-sm text-primary">
          Belanja lagi
        </Link>
      </main>
    );
  }
  if (order.status !== "PENDING_PAYMENT") return <Navigate to={`/orders/${order.id}`} replace />;

  return (
    <main className="mx-auto max-w-2xl space-y-3 p-4 text-center" aria-live="polite">
      <h1 className="text-xl font-semibold">Memverifikasi pembayaran…</h1>
      <p className="text-sm text-muted-foreground">Jangan tutup halaman ini. Status pesanan {order.code} diperbarui otomatis.</p>
      <Link to={`/orders/${order.id}`} className="text-sm text-primary">
        Lihat detail pesanan
      </Link>
    </main>
  );
}
