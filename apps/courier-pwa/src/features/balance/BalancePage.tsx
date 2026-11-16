import { Link, Navigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { FaArrowDown, FaArrowLeft, FaArrowUp, FaFilePdf, FaWallet } from "react-icons/fa";
import { formatIDR, groupByDay, type CourierLedgerEntry } from "@2m/shared";
import { EmptyState, ErrorCard, LoadingBlock } from "@/components/ui/feedback";
import { useSession } from "@/features/session/session";
import { errorMessage } from "@/lib/api";
import { downloadPdf } from "@/lib/download";
import { cn } from "@/lib/utils";
import { BalanceAmount } from "./BalanceAmount";
import { useBalanceHistory } from "./hooks";

// The day is in the divider above, so a row shows only the time.
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

function entryTitle(entry: CourierLedgerEntry): string {
  if (entry.type === "WITHDRAWAL") return "Tarik tunai di toko";
  return entry.order_status === "FAILED" ? "Upah gagal kirim" : "Upah pengantaran";
}

function SlipButton({ entryId }: { entryId: string }) {
  const slip = useMutation({ mutationFn: () => downloadPdf(`/courier/balance/withdrawals/${entryId}/slip`) });
  return (
    <>
      <button
        type="button"
        className="btn btn-secondary btn-sm mt-2"
        disabled={slip.isPending}
        onClick={() => slip.mutate()}
      >
        <FaFilePdf aria-hidden="true" />
        {slip.isPending ? "Membuat slip…" : "Slip penarikan"}
      </button>
      {slip.isError && (
        <p className="mt-1 text-sm text-destructive" role="alert">
          {slip.error.message}
        </p>
      )}
    </>
  );
}

function EntryRow({ entry }: { entry: CourierLedgerEntry }) {
  const earning = entry.amount > 0;
  const detail = earning ? entry.order_code : entry.recorded_by_name && `Dicatat ${entry.recorded_by_name}`;
  return (
    <li className="flex items-center gap-3 px-3.5 py-3">
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-md text-sm",
          earning ? "bg-success-surface text-success" : "bg-muted text-muted-foreground",
        )}
      >
        {earning ? <FaArrowDown aria-hidden="true" /> : <FaArrowUp aria-hidden="true" />}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="font-bold">{entryTitle(entry)}</p>
        {detail && <p className="t-label mt-0.5 truncate">{detail}</p>}
        <p className="t-label mt-0.5 tabular-nums">{timeOf(entry.created_at)}</p>
        {entry.type === "WITHDRAWAL" && <SlipButton entryId={entry.id} />}
      </div>
      <span className={cn("shrink-0 font-extrabold tabular-nums tracking-tight", earning && "text-success")}>
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
        <Link to="/" aria-label="Kembali" className="icon-btn">
          <FaArrowLeft aria-hidden="true" />
        </Link>
        <h1 className="t-title">Saldo keuntungan</h1>
      </header>
      <main className="app-main">
        <section aria-label="Saldo saat ini" className="panel-ink flex animate-rise flex-col gap-2">
          <p className="t-label">Saldo saat ini</p>
          {user && <BalanceAmount className="t-figure" />}
          <p className="mt-2 border-t border-rail-foreground/20 pt-3 text-sm text-rail-muted">Tarik tunai di toko. Admin cabang yang mencatat penarikan Anda.</p>
        </section>

        <section aria-labelledby="balance-history-heading" className="flex flex-col gap-3">
          <div className="section-head">
            <h2 id="balance-history-heading" className="t-title">
              Riwayat saldo
            </h2>
          </div>
          {history.isLoading && <LoadingBlock />}
          {history.isError && <ErrorCard message={errorMessage(history.error)} onRetry={() => void history.refetch()} />}
          {history.isSuccess && entries.length === 0 && (
            <EmptyState icon={<FaWallet />} title="Belum ada riwayat" hint="Upah masuk ke saldo setelah pesanan selesai." />
          )}
          {groupByDay(entries, (e) => e.created_at).map((group) => (
            <section key={group.key} className="flex flex-col gap-2" aria-label={group.heading}>
              <h3 className="date-divider mt-1">
                {group.heading}
                <span className="date-divider-count">{group.items.length} transaksi</span>
              </h3>
              <ul className="list">
                {group.items.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} />
                ))}
              </ul>
            </section>
          ))}
          {history.hasNextPage && (
            <button
              type="button"
              disabled={history.isFetchingNextPage}
              onClick={() => void history.fetchNextPage()}
              className="btn btn-secondary"
            >
              {history.isFetchingNextPage ? "Memuat…" : "Muat lagi"}
            </button>
          )}
        </section>
      </main>
    </>
  );
}
