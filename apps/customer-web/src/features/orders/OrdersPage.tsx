import { Link } from "react-router-dom";
import { formatIDR } from "@2m/shared";
import { useOrderHistory } from "../../lib/queries";
import { IconReceipt } from "../../components/Icons";
import { btnSecondary, EmptyState, ErrorCard, PageSkeleton, rise } from "../../components/States";
import { StatusPill } from "../../components/StatusPill";
import { cn } from "../../lib/utils";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function OrdersPage() {
  const { data, isLoading, isError, hasNextPage, isFetchingNextPage, fetchNextPage, refetch } = useOrderHistory();

  if (isLoading) return <PageSkeleton />;
  if (isError || !data) {
    return (
      <main className="app-main">
        <ErrorCard message="Gagal memuat pesanan." onRetry={() => void refetch()} />
      </main>
    );
  }

  const orders = data.pages.flatMap((p) => p.orders);

  return (
    <main className="app-main">
      <h1 className="text-2xl font-bold">Pesanan saya</h1>
      {orders.length === 0 && (
        <EmptyState icon={<IconReceipt />} title="Belum ada pesanan.">
          <Link to="/" className={cn(btnSecondary, "mt-2")}>
            Mulai belanja
          </Link>
        </EmptyState>
      )}
      {orders.map((o, i) => (
        <Link key={o.id} to={`/orders/${o.id}`} className="card card-link animate-rise space-y-2 text-sm" style={rise(i)}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold">{o.code}</span>
            <StatusPill status={o.status} />
          </div>
          <div className="text-xs text-muted-foreground">
            {fmtDate(o.created_at)} · {o.branch_name}
          </div>
          <div className="card-footer flex justify-between">
            <span>{o.item_count} barang</span>
            <span className="font-bold">{formatIDR(o.grand_total)}</span>
          </div>
        </Link>
      ))}
      {hasNextPage && (
        <button onClick={() => void fetchNextPage()} disabled={isFetchingNextPage} className={cn(btnSecondary, "w-full text-sm")}>
          {isFetchingNextPage ? "Memuat…" : "Muat lagi"}
        </button>
      )}
    </main>
  );
}
