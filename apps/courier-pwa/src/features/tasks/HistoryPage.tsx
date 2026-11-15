import { FaHistory } from "react-icons/fa";
import { groupByDay, type CourierOrder } from "@2m/shared";
import { EmptyState, ErrorCard, LoadingBlock } from "@/components/ui/feedback";
import { errorMessage } from "@/lib/api";
import { useOrders } from "./hooks";
import { OrderCard } from "./OrderCard";

export function HistoryPage() {
  const orders = useOrders();
  // Sorted by the date the groups use, so one day never splits into two headings.
  const finishedAt = (o: CourierOrder) => o.delivered_at ?? o.updated_at;
  const recent = [...(orders.data?.recent.slice(0, 10) ?? [])].sort((a, b) => finishedAt(b).localeCompare(finishedAt(a)));

  return (
    <>
      <header className="app-header">
        <div className="leading-tight">
          <h1 className="t-title">Riwayat</h1>
          <p className="t-label mt-0.5">10 terakhir selesai</p>
        </div>
      </header>
      <main className="app-main">
        {orders.isLoading && <LoadingBlock />}
        {orders.isError && <ErrorCard message={errorMessage(orders.error)} onRetry={() => void orders.refetch()} />}
        {orders.data && recent.length === 0 && (
          <EmptyState icon={<FaHistory />} title="Belum ada riwayat" hint="Pesanan yang selesai akan muncul di sini." />
        )}
        {groupByDay(recent, finishedAt).map((group) => (
          <section key={group.key} className="flex flex-col gap-3" aria-label={group.heading}>
            <h2 className="date-divider mt-1">
              {group.heading}
              <span className="date-divider-count">{group.items.length} pengantaran</span>
            </h2>
            {group.items.map((o) => (
              <OrderCard key={o.id} order={o} index={recent.indexOf(o)} />
            ))}
          </section>
        ))}
      </main>
    </>
  );
}
