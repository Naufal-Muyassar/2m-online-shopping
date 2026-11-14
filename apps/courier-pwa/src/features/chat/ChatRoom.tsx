import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { CHAT_MESSAGE_MAX, type ChatMessage } from "@2m/shared";
import { FaArrowLeft, FaPaperPlane } from "react-icons/fa";
import { ErrorCard } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api";
import { useAdminThread, useChatMarkRead, useChatMessages, useChatSend } from "./hooks";

const fmtClock = (iso: string) => new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

function dayLabel(iso: string): string {
  if (new Date(iso).toDateString() === new Date().toDateString()) return "Hari ini";
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function Messages({ messages }: { messages: ChatMessage[] }) {
  return (
    <>
      {messages.map((m, i) => {
        const newDay = i === 0 || dayLabel(messages[i - 1]!.created_at) !== dayLabel(m.created_at);
        return (
          <div key={m.id} className="flex flex-col gap-1">
            {newDay && <p className="chat-day">{dayLabel(m.created_at)}</p>}
            <p className={`bubble ${m.mine ? "bubble-mine" : "bubble-other"}`}>{m.body}</p>
            <p className={`t-label tabular-nums ${m.mine ? "self-end" : "self-start"}`}>{fmtClock(m.created_at)}</p>
          </div>
        );
      })}
    </>
  );
}

function ChatRoom({ threadId }: { threadId: string }) {
  const { notify } = useToast();
  const { data, isLoading, isError, error, refetch } = useChatMessages(threadId);
  const send = useChatSend(threadId);
  const markRead = useChatMarkRead(threadId);
  const [text, setText] = useState("");
  const clientId = useRef(crypto.randomUUID());
  const endRef = useRef<HTMLDivElement>(null);
  const count = data?.messages.length ?? 0;
  const unread = data?.thread.unread_count ?? 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [count]);
  useEffect(() => {
    if (unread > 0) markRead.mutate();
  }, [unread, threadId]);

  const thread = data?.thread;
  const back = thread?.order_id ? `/orders/${thread.order_id}` : "/";

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body || send.isPending) return;
    send.mutate(
      { body, client_id: clientId.current },
      {
        onSuccess: () => {
          clientId.current = crypto.randomUUID();
          setText("");
        },
        onError: (err) => notify("error", errorMessage(err)),
      },
    );
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex h-dvh flex-col">
      <header className="app-header">
        <Link to={back} aria-label="Kembali" className="icon-btn">
          <FaArrowLeft aria-hidden="true" />
        </Link>
        <div className="min-w-0 flex-1 leading-tight">
          <h1 className="t-title truncate">{thread?.title ?? "Chat"}</h1>
          {thread?.order_code && <p className="t-label mt-0.5 truncate">Order {thread.order_code}</p>}
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-3" aria-live="polite">
        {isLoading && (
          <div className="flex flex-col gap-3 pt-2" aria-busy="true" aria-label="Memuat">
            <div className="skeleton h-12 w-2/3" />
            <div className="skeleton ml-auto h-12 w-1/2" />
          </div>
        )}
        {isError && <ErrorCard message={errorMessage(error)} onRetry={() => void refetch()} />}
        {data && count === 0 && <p className="m-auto text-sm text-muted-foreground">Tulis pesan pertama Anda.</p>}
        {data && <Messages messages={data.messages} />}
        <div ref={endRef} />
      </main>

      {thread && !thread.can_send ? (
        <p className="notice mx-4 mb-4 text-center">Chat ditutup karena pesanan sudah selesai.</p>
      ) : (
        <form onSubmit={submit} className="flex items-end gap-2 border-t border-border bg-surface p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <textarea
            rows={1}
            value={text}
            maxLength={CHAT_MESSAGE_MAX}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Tulis pesan…"
            aria-label="Tulis pesan"
            className="field max-h-32 resize-none"
          />
          <button type="submit" aria-label="Kirim" disabled={!text.trim() || send.isPending} className="send-btn">
            <FaPaperPlane aria-hidden="true" />
          </button>
        </form>
      )}
    </div>
  );
}

export function ChatRoomPage() {
  const { threadId = "" } = useParams();
  return <ChatRoom threadId={threadId} />;
}

export function AdminChatPage() {
  const thread = useAdminThread();
  if (thread.isError) {
    return (
      <main className="app-main">
        <ErrorCard message={errorMessage(thread.error)} onRetry={() => void thread.refetch()} />
      </main>
    );
  }
  if (!thread.data) {
    return (
      <main className="app-main" aria-busy="true" aria-label="Memuat">
        <div className="skeleton h-16" />
      </main>
    );
  }
  return <ChatRoom threadId={thread.data.id} />;
}
