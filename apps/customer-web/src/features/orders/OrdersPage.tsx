import { Link } from "react-router-dom";
import { formatIDR, groupByDay } from "@2m/shared";
import { useOrderHistory } from "../../lib/queries";
import { IconChevron, IconReceipt } from "../../components/Icons";
import { EmptyState, ErrorCard, PageSkeleton, rise } from "../../components/States";
import { StatusPill } from "../../components/StatusPill";

// The day is in the group heading, so a row only needs the time.
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

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
      <h1 className="t-headline">Pesanan saya</h1>
      {orders.length === 0 && (
        <EmptyState icon={<IconReceipt />} title="Belum ada pesanan.">
          <Link to="/" className="btn btn-secondary mt-2">
            Mulai belanja
          </Link>
        </EmptyState>
      )}
      {orders.length > 0 &&
        groupByDay(orders, (o) => o.created_at).map((group) => (
          <section key={group.key} className="flex flex-col gap-2.5" aria-label={group.heading}>
            <h2 className="date-divider">
              {group.heading}
              <span className="date-divider-count">{group.items.length} pesanan</span>
            </h2>
            <ul className="list">
              {group.items.map((o) => (
                <li key={o.id} className="animate-rise" style={rise(orders.indexOf(o))}>
                  <Link to={`/orders/${o.id}`} className="list-row py-3.5">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-extrabold tabular-nums tracking-tight">{o.code}</span>
                        <StatusPill status={o.status} />
                      </span>
                      <span className="t-label mt-1.5 block tabular-nums">
                        {fmtTime(o.created_at)} · {o.branch_name}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-extrabold tabular-nums tracking-tight">{formatIDR(o.grand_total)}</span>
                      <span className="t-label mt-1 block">{o.item_count} barang</span>
                    </span>
                    <IconChevron className="row-arrow text-lg" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      {hasNextPage && (
        <button onClick={() => void fetchNextPage()} disabled={isFetchingNextPage} className="btn btn-secondary self-start">
          {isFetchingNextPage ? "Memuat…" : "Muat lagi"}
        </button>
      )}
    </main>
  );
}
