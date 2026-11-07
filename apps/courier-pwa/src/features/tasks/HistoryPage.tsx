import { FaHistory } from "react-icons/fa";
import { EmptyState, ErrorCard, LoadingBlock } from "@/components/ui/feedback";
import { errorMessage } from "@/lib/api";
import { useOrders } from "./hooks";
import { OrderCard } from "./OrderCard";

export function HistoryPage() {
  const orders = useOrders();
  const recent = orders.data?.recent.slice(0, 10) ?? [];

  return (
    <>
      <header className="app-header">
        <div>
          <h1 className="text-xl font-bold">Riwayat</h1>
          <p className="text-xs text-muted-foreground">10 terakhir selesai</p>
        </div>
      </header>
      <main className="app-main">
        {orders.isLoading && <LoadingBlock />}
        {orders.isError && <ErrorCard message={errorMessage(orders.error)} onRetry={() => void orders.refetch()} />}
        {orders.data && recent.length === 0 && (
          <EmptyState icon={<FaHistory />} title="Belum ada riwayat" hint="Pesanan yang selesai akan muncul di sini." />
        )}
        {recent.map((o, i) => (
          <OrderCard key={o.id} order={o} index={i} />
        ))}
      </main>
    </>
  );
}
