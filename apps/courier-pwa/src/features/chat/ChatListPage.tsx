import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { ChatThread } from "@2m/shared";
import { FaArrowRight, FaBox, FaHeadset } from "react-icons/fa";
import { EmptyState, ErrorCard, LoadingBlock } from "@/components/ui/feedback";
import { errorMessage } from "@/lib/api";
import { useChatThreads } from "./hooks";

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) {
    return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

function preview(t: ChatThread | undefined, fallback: string): string {
  if (!t?.last_message) return fallback;
  return `${t.last_message.mine ? "Anda: " : ""}${t.last_message.body}`;
}

function ThreadRow({
  to,
  icon,
  title,
  thread,
  fallback,
}: {
  to: string;
  icon: ReactNode;
  title: string;
  thread: ChatThread | undefined;
  fallback: string;
}) {
  const unread = thread?.unread_count ?? 0;
  const label = unread > 0 ? `${title}, ${unread} pesan belum dibaca` : title;
  return (
    <Link to={to} aria-label={label} className="list-row">
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-surface text-primary">
        {icon}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-baseline gap-2">
          <p className="flex-1 truncate font-semibold">{title}</p>
          {thread?.last_message && <p className="t-label shrink-0 tabular-nums">{fmtWhen(thread.last_message.at)}</p>}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <p className={`flex-1 truncate text-sm ${unread > 0 ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
            {preview(thread, fallback)}
          </p>
          {unread > 0 && <span className="count-badge static shrink-0">{unread}</span>}
        </div>
      </div>
      <FaArrowRight aria-hidden="true" className="row-arrow text-xs" />
    </Link>
  );
}

export function ChatListPage() {
  const threads = useChatThreads();
  const admin = threads.data?.find((t) => t.channel === "courier_admin");
  // Closed customer chats stay reachable from the order page; the list holds only the ones still open.
  const customers = threads.data?.filter((t) => t.channel === "customer_courier" && t.can_send) ?? [];

  return (
    <>
      <header className="app-header">
        <div className="leading-tight">
          <h1 className="t-title">Chat</h1>
          <p className="t-label mt-0.5">Admin cabang dan pelanggan aktif</p>
        </div>
      </header>
      <main className="app-main">
        {/* The admin thread is opened on first visit, so this row never waits for the list. */}
        <nav aria-label="Chat admin" className="list">
          <ThreadRow to="/chat/admin" icon={<FaHeadset />} title="Admin cabang" thread={admin} fallback="Tanya admin cabang" />
        </nav>

        <section aria-labelledby="chat-customers" className="flex flex-col gap-2">
          <h2 id="chat-customers" className="t-label">
            Pelanggan{threads.data ? ` (${customers.length})` : ""}
          </h2>
          {threads.isLoading && <LoadingBlock rows={1} />}
          {threads.isError && <ErrorCard message={errorMessage(threads.error)} onRetry={() => void threads.refetch()} />}
          {threads.data && customers.length === 0 && (
            <EmptyState icon={<FaBox />} title="Belum ada chat pelanggan" hint="Chat pelanggan muncul di sini selama Anda mengantar pesanannya." />
          )}
          {customers.length > 0 && (
            <nav aria-label="Chat pelanggan" className="list">
              {customers.map((t) => (
                <ThreadRow
                  key={t.id}
                  to={`/chat/${t.id}`}
                  icon={<FaBox />}
                  title={t.title}
                  thread={t}
                  fallback={t.order_code ? `Order ${t.order_code}` : "Belum ada pesan"}
                />
              ))}
            </nav>
          )}
        </section>
      </main>
    </>
  );
}
