import { Link, useNavigate } from "react-router-dom";
import { errorMessage } from "../../lib/api";
import { useBranches, useChatThreads, useOpenChat } from "../../lib/queries";
import { useToast } from "../../lib/toast";
import { IconChat, IconChevron, IconStore } from "../../components/Icons";
import { EmptyState, ErrorCard, PageSkeleton, rise } from "../../components/States";

const LAST_BRANCH_KEY = "2m.last_branch";

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function ChatListPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { data: threads, isLoading, isError, refetch } = useChatThreads("customer_admin");
  const open = useOpenChat();
  const branchId = localStorage.getItem(LAST_BRANCH_KEY);
  const branch = useBranches().data?.find((b) => b.id === branchId);
  const hasBranchThread = threads?.some((t) => t.branch_id === branchId) ?? false;

  function startChat() {
    if (!branchId) return;
    open.mutate(
      { channel: "customer_admin", branch_id: branchId },
      { onSuccess: (t) => navigate(`/chat/${t.id}`), onError: (e) => toast("error", errorMessage(e)) },
    );
  }

  if (isLoading) return <PageSkeleton />;
  if (isError || !threads) {
    return (
      <main className="app-main">
        <ErrorCard message="Gagal memuat chat." onRetry={() => void refetch()} />
      </main>
    );
  }

  return (
    <main className="app-main">
      <div className="flex flex-col gap-2">
        <h1 className="t-headline">Chat toko</h1>
        <p className="text-muted-foreground">Tanya stok, pesanan, atau pengantaran ke admin toko.</p>
      </div>

      <div className="flex flex-col gap-4">
        {threads.length === 0 && !branch && (
          <EmptyState icon={<IconChat />} title="Belum ada chat.">
            <p className="text-sm">Pilih cabang dulu untuk mulai chat dengan toko.</p>
            <Link to="/" className="btn btn-primary mt-2">
              Pilih cabang
            </Link>
          </EmptyState>
        )}

        {threads.length > 0 && (
          <ul className="list">
            {threads.map((t, i) => (
              <li key={t.id} className="animate-rise" style={rise(i)}>
                <Link to={`/chat/${t.id}`} className="list-row py-3.5">
                  <span className="empty-state-icon">
                    <IconStore />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-extrabold tracking-tight">{t.title}</span>
                      {t.last_message && <span className="t-label shrink-0 tabular-nums">{fmtTime(t.last_message.at)}</span>}
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-muted-foreground">
                        {t.last_message ? `${t.last_message.mine ? "Anda: " : ""}${t.last_message.body}` : "Belum ada pesan"}
                      </span>
                      {t.unread_count > 0 && <span className="count-badge static shrink-0">{t.unread_count}</span>}
                    </span>
                  </span>
                  <IconChevron className="row-arrow text-lg" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {branch && !hasBranchThread && (
          <button type="button" onClick={startChat} disabled={open.isPending} className="btn btn-primary btn-lg btn-block">
            <IconChat /> {open.isPending ? "Membuka…" : `Chat ${branch.name}`}
          </button>
        )}
      </div>
    </main>
  );
}
