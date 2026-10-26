import { Link } from "react-router-dom";
import { CUSTOMER_STATUS_LABELS, formatIDR } from "@2m/shared";
import { useOrderHistory } from "../../lib/queries";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function OrdersPage() {
  const { data, isLoading, isError, hasNextPage, isFetchingNextPage, fetchNextPage, refetch } = useOrderHistory();

  if (isLoading) return <p className="p-4 text-sm text-muted-foreground">Memuat…</p>;
  if (isError || !data) {
    return (
      <main className="mx-auto max-w-2xl space-y-2 p-4 text-sm">
        <p className="text-destructive">Gagal memuat pesanan.</p>
        <button onClick={() => void refetch()} className="rounded-md border px-3 py-1.5 hover:bg-secondary">
          Coba lagi
        </button>
      </main>
    );
  }

  const orders = data.pages.flatMap((p) => p.orders);

  return (
    <main className="mx-auto max-w-2xl space-y-3 p-4">
      <h1 className="text-xl font-semibold">Pesanan saya</h1>
      {orders.length === 0 && (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          Belum ada pesanan.{" "}
          <Link to="/" className="text-primary">
            Mulai belanja
          </Link>
        </p>
      )}
      {orders.map((o) => (
        <Link key={o.id} to={`/orders/${o.id}`} className="block space-y-1 rounded-lg border p-4 text-sm hover:bg-secondary">
          <div className="flex justify-between">
            <span className="font-semibold">{o.code}</span>
            <span>{CUSTOMER_STATUS_LABELS[o.status]}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {fmtDate(o.created_at)} · {o.branch_name}
          </div>
          <div className="flex justify-between">
            <span>{o.item_count} barang</span>
            <span className="font-semibold">{formatIDR(o.grand_total)}</span>
          </div>
        </Link>
      ))}
      {hasNextPage && (
        <button
          onClick={() => void fetchNextPage()}
          disabled={isFetchingNextPage}
          className="w-full rounded-md border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50"
        >
          {isFetchingNextPage ? "Memuat…" : "Muat lagi"}
        </button>
      )}
    </main>
  );
}
