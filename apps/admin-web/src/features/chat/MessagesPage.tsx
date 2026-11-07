import { cn } from "../../lib/utils";
import { useBranch } from "../branch-config/BranchProvider";
import { ChatPane } from "./ChatPane";
import { useChatThreads, useUnreadChats } from "./hooks";

export type InboxChannel = "customer_admin" | "courier_admin";

const INBOXES: { id: InboxChannel; label: string }[] = [
  { id: "customer_admin", label: "Pelanggan" },
  { id: "courier_admin", label: "Kurir" },
];

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

interface Props {
  channel: InboxChannel;
  threadId: string | null;
  onChannel: (channel: InboxChannel) => void;
  onThread: (id: string) => void;
}

export function MessagesPage({ channel, threadId, onChannel, onThread }: Props) {
  const { branchId } = useBranch();
  const { data: threads, isLoading, isError } = useChatThreads(channel);
  const unread = useUnreadChats();
  const selected = threadId ?? threads?.[0]?.id ?? null;

  if (!branchId) return <p className="p-4 text-sm text-muted-foreground">Pilih cabang…</p>;

  return (
    <div className="grid gap-4 p-4 lg:h-[calc(100dvh-5rem)] lg:grid-cols-[24rem_minmax(0,1fr)]">
      <section className="card flex min-h-0 flex-col gap-3">
        <h1 className="text-2xl font-bold">Pesan</h1>
        <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1" role="tablist" aria-label="Kotak pesan">
          {INBOXES.map((inbox) => (
            <button
              key={inbox.id}
              role="tab"
              aria-selected={channel === inbox.id}
              onClick={() => onChannel(inbox.id)}
              className={cn(
                "flex min-h-11 items-center justify-center gap-2 rounded-full text-sm font-medium",
                channel === inbox.id ? "bg-primary font-bold text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {inbox.label}
              {unread[inbox.id] > 0 && <span className="count-badge static">{unread[inbox.id]}</span>}
            </button>
          ))}
        </div>
        {isLoading && <div className="skeleton h-16" role="status" aria-busy="true" aria-label="Memuat" />}
        {isError && (
          <p className="alert-box" role="alert">
            Gagal memuat pesan.
          </p>
        )}
        {threads && threads.length === 0 && (
          <div className="empty-state">
            <p>Belum ada pesan.</p>
          </div>
        )}
        <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {threads?.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => onThread(t.id)}
                aria-pressed={t.id === selected}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border p-3 text-left",
                  t.id === selected ? "border-primary bg-primary-surface" : "border-transparent hover:bg-muted",
                )}
              >
                <span className="avatar" aria-hidden="true">
                  {t.title.charAt(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-bold">{t.title}</span>
                    {t.last_message && <span className="shrink-0 text-xs text-muted-foreground">{fmtTime(t.last_message.at)}</span>}
                  </span>
                  <span className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                    <span className="truncate">
                      {t.last_message?.mine ? "Anda: " : ""}
                      {t.last_message?.body}
                    </span>
                    {t.unread_count > 0 && <span className="count-badge static shrink-0">{t.unread_count}</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card flex min-h-[28rem] flex-col gap-3">
        {selected ? (
          <ChatPane key={selected} threadId={selected} showTitle />
        ) : (
          <div className="empty-state m-auto w-full">
            <p>Pilih percakapan untuk membalas.</p>
          </div>
        )}
      </section>
    </div>
  );
}
