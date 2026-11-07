import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { CHAT_MESSAGE_MAX, type ChatMessage } from "@2m/shared";
import { IconSend } from "../../components/Icons";
import { errorMessage } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { useChatMarkRead, useChatMessages, useChatSend } from "./hooks";

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
            {newDay && <p className="pill mx-auto my-2 bg-surface">{dayLabel(m.created_at)}</p>}
            <p className={`bubble ${m.mine ? "bubble-mine" : "bubble-other"}`}>{m.body}</p>
            <p className={`text-xs text-muted-foreground ${m.mine ? "self-end" : "self-start"}`}>
              {m.mine ? `${m.sender_name} · ` : ""}
              {fmtClock(m.created_at)}
            </p>
          </div>
        );
      })}
    </>
  );
}

export function ChatPane({ threadId, showTitle = false }: { threadId: string; showTitle?: boolean }) {
  const toast = useToast();
  const { data, isLoading, isError, error } = useChatMessages(threadId);
  const send = useChatSend(threadId);
  const markRead = useChatMarkRead(threadId);
  const [text, setText] = useState("");
  const clientId = useRef(crypto.randomUUID());
  const listRef = useRef<HTMLDivElement>(null);
  const count = data?.messages.length ?? 0;
  const unread = data?.thread.unread_count ?? 0;

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [count, threadId]);

  useEffect(() => {
    if (unread > 0) markRead.mutate();
  }, [unread, threadId]);

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
        onError: (err) => toast("error", errorMessage(err)),
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
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {showTitle && <h2 className="text-lg font-bold">{data?.thread.title ?? "Chat"}</h2>}
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-lg bg-muted/50 p-3" aria-live="polite">
        {isLoading && <div className="skeleton h-12 w-2/3 rounded-lg" role="status" aria-busy="true" aria-label="Memuat" />}
        {isError && (
          <p className="alert-box" role="alert">
            {errorMessage(error)}
          </p>
        )}
        {data && count === 0 && <p className="m-auto text-sm text-muted-foreground">Belum ada pesan.</p>}
        {data && <Messages messages={data.messages} />}
      </div>
      <form onSubmit={submit} className="flex items-end gap-2">
        <textarea
          rows={1}
          value={text}
          maxLength={CHAT_MESSAGE_MAX}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Tulis pesan…"
          aria-label="Tulis pesan"
          className="field max-h-32 resize-none rounded-2xl"
        />
        <button
          type="submit"
          aria-label="Kirim"
          disabled={!text.trim() || send.isPending}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-xl text-primary-foreground hover:bg-primary-pressed disabled:bg-muted disabled:text-muted-foreground"
        >
          <IconSend />
        </button>
      </form>
    </div>
  );
}
