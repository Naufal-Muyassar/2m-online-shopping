import { Link, Navigate } from "react-router-dom";
import { FaArrowDown, FaArrowLeft, FaArrowUp, FaWallet } from "react-icons/fa";
import { formatIDR, type CourierLedgerEntry } from "@2m/shared";
import { EmptyState, ErrorCard, LoadingBlock } from "@/components/ui/feedback";
import { useSession } from "@/features/session/session";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { BalanceAmount } from "./BalanceAmount";
import { useBalanceHistory } from "./hooks";

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function entryTitle(entry: CourierLedgerEntry): string {
  if (entry.type === "WITHDRAWAL") return "Tarik tunai di toko";
  return entry.order_status === "FAILED" ? "Upah gagal kirim" : "Upah pengantaran";
}

function EntryRow({ entry }: { entry: CourierLedgerEntry }) {
  const earning = entry.amount > 0;
  const detail = earning ? entry.order_code : entry.recorded_by_name && `Dicatat ${entry.recorded_by_name}`;
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-sm">
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full",
          earning ? "bg-success-surface text-success" : "bg-muted text-muted-foreground",
        )}
      >
        {earning ? <FaArrowDown aria-hidden="true" /> : <FaArrowUp aria-hidden="true" />}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="font-medium">{entryTitle(entry)}</p>
        {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
        <p className="text-xs text-muted-foreground">{dateTime(entry.created_at)}</p>
      </div>
      <span className={cn("shrink-0 font-bold tabular-nums", earning && "text-success")}>
        {earning ? "+" : "−"}
        {formatIDR(Math.abs(entry.amount))}
      </span>
    </li>
  );
}

export function BalancePage() {
  const { user, loading } = useSession();
  const history = useBalanceHistory(!loading && user !== null);
  const entries = history.data?.pages.flatMap((p) => p.entries) ?? [];

  if (!loading && !user) return <Navigate to="/login" replace />;

  return (
    <>
      <header className="app-header">
        <Link to="/" aria-label="Kembali" className="icon-btn shrink-0">
          <FaArrowLeft aria-hidden="true" />
        </Link>
        <h1 className="text-xl font-bold">Saldo keuntungan</h1>
      </header>
      <main className="app-main">
        <section aria-label="Saldo saat ini" className="flex flex-col gap-1 rounded-2xl bg-foreground p-4 text-surface">
          <p className="text-sm opacity-80">Saldo saat ini</p>
          {user && <BalanceAmount className="text-3xl" />}
          <p className="text-sm opacity-80">Tarik tunai di toko. Admin cabang yang mencatat penarikan Anda.</p>
        </section>

        <section aria-labelledby="balance-history-heading" className="flex flex-col gap-3">
          <h2 id="balance-history-heading" className="text-lg font-bold">
            Riwayat saldo
          </h2>
          {history.isLoading && <LoadingBlock />}
          {history.isError && <ErrorCard message={errorMessage(history.error)} onRetry={() => void history.refetch()} />}
          {history.isSuccess && entries.length === 0 && (
            <EmptyState icon={<FaWallet />} title="Belum ada riwayat" hint="Upah masuk ke saldo setelah pesanan selesai." />
          )}
          <ul className="flex flex-col gap-2">
            {entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} />
            ))}
          </ul>
          {history.hasNextPage && (
            <button
              type="button"
              disabled={history.isFetchingNextPage}
              onClick={() => void history.fetchNextPage()}
              className="min-h-11 rounded-full border border-border bg-surface px-4 font-medium disabled:opacity-60"
            >
              {history.isFetchingNextPage ? "Memuat…" : "Muat lagi"}
            </button>
          )}
        </section>
      </main>
    </>
  );
}
