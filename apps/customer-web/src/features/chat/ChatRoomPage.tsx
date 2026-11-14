import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { CHAT_MESSAGE_MAX, type ChatMessage } from "@2m/shared";
import { errorMessage } from "../../lib/api";
import { useChatMarkRead, useChatMessages, useChatSend } from "../../lib/queries";
import { useToast } from "../../lib/toast";
import { IconBack, IconSend } from "../../components/Icons";
import { ErrorCard } from "../../components/States";

const fmtClock = (iso: string) => new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

function dayLabel(iso: string): string {
  const day = new Date(iso).toDateString();
  if (day === new Date().toDateString()) return "Hari ini";
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

export function ChatRoomPage() {
  const { threadId = "" } = useParams();
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useChatMessages(threadId);
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
  const back = thread?.order_id ? `/orders/${thread.order_id}` : "/chat";

  function submit(e?: FormEvent) {
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
        onError: (err) => toast("error", errorMessage(err)),
      },
    );
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-3xl flex-col bg-background md:border-x md:border-border">
      <header className="app-header">
        <Link to={back} aria-label="Kembali" className="icon-btn">
          <IconBack />
        </Link>
        <div className="min-w-0 flex-1 leading-tight">
          <h1 className="t-title truncate">{thread?.title ?? "Chat"}</h1>
          {thread?.order_code && <p className="t-label mt-0.5 truncate">Pesanan {thread.order_code}</p>}
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-3 md:px-6" aria-live="polite">
        {isLoading && (
          <div className="space-y-3 pt-2" aria-busy="true" aria-label="Memuat">
            <div className="skeleton h-12 w-2/3" />
            <div className="skeleton ml-auto h-12 w-1/2" />
          </div>
        )}
        {isError && <ErrorCard message="Gagal memuat chat." onRetry={() => void refetch()} />}
        {data && count === 0 && <p className="m-auto text-sm text-muted-foreground">Tulis pesan pertama Anda.</p>}
        {data && <Messages messages={data.messages} />}
        <div ref={endRef} />
      </main>

      {thread && !thread.can_send ? (
        <p className="notice mx-4 mb-4 text-center md:mx-6">Chat ditutup karena pesanan sudah selesai.</p>
      ) : (
        <form onSubmit={submit} className="flex items-end gap-2 border-t border-border bg-surface p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-6">
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
            <IconSend />
          </button>
        </form>
      )}
    </div>
  );
}
