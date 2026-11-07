import type { AdminCourier, ChatThread } from "@2m/shared";
import { Segmented, useSwapX } from "../../components/Segmented";
import { cn } from "../../lib/utils";
import { useBranch } from "../branch-config/BranchProvider";
import { isOnline, useBranchCouriers } from "../couriers/hooks";
import { ChatPane } from "./ChatPane";
import { useChatThreads, useUnreadChats } from "./hooks";
import { OpenedChat } from "./OpenedChat";

export type InboxChannel = "customer_admin" | "courier_admin";

const INBOXES: { id: InboxChannel; label: string }[] = [
  { id: "customer_admin", label: "Pelanggan" },
  { id: "courier_admin", label: "Kurir" },
];

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Presence({ online }: { online: boolean }) {
  return <span className={cn("pill pill-dot shrink-0 py-0.5", online ? "pill-success" : "")}>{online ? "Online" : "Offline"}</span>;
}

function RowShell({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <li>
      <button
        onClick={onClick}
        aria-pressed={selected}
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-[background-color,transform] duration-150 active:scale-[0.985]",
          selected ? "bg-primary-surface" : "hover:bg-muted",
        )}
      >
        {children}
      </button>
    </li>
  );
}

function ThreadRow({ thread, selected, onClick }: { thread: ChatThread; selected: boolean; onClick: () => void }) {
  return (
    <RowShell selected={selected} onClick={onClick}>
      <span className="avatar" aria-hidden="true">
        {thread.title.charAt(0)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-bold">{thread.title}</span>
          {thread.last_message && <span className="shrink-0 text-xs text-muted-foreground">{fmtTime(thread.last_message.at)}</span>}
        </span>
        <span className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span className="truncate">
            {thread.last_message?.mine ? "Anda: " : ""}
            {thread.last_message?.body}
          </span>
          {thread.unread_count > 0 && <span className="count-badge static shrink-0">{thread.unread_count}</span>}
        </span>
      </span>
    </RowShell>
  );
}

function courierHint(courier: AdminCourier, thread: ChatThread | undefined): string {
  if (thread?.last_message) return `${thread.last_message.mine ? "Anda: " : ""}${thread.last_message.body}`;
  if (courier.current_order) return `Mengantar ${courier.current_order.code}`;
  return "Mulai percakapan";
}

function CourierRow({ courier, thread, selected, onClick }: { courier: AdminCourier; thread?: ChatThread; selected: boolean; onClick: () => void }) {
  return (
    <RowShell selected={selected} onClick={onClick}>
      <span className="relative shrink-0">
        <span className={cn("avatar", !isOnline(courier) && "grayscale")} aria-hidden="true">
          {courier.name.charAt(0)}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate font-bold">{courier.name}</span>
          <Presence online={isOnline(courier)} />
        </span>
        <span className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span className="truncate">{courierHint(courier, thread)}</span>
          {!!thread?.unread_count && <span className="count-badge static shrink-0">{thread.unread_count}</span>}
        </span>
      </span>
    </RowShell>
  );
}

// Unread first, then the latest conversation, then whoever is online.
function rankCouriers(couriers: AdminCourier[], threadOf: (id: string) => ChatThread | undefined) {
  const at = (c: AdminCourier) => threadOf(c.user_id)?.last_message?.at ?? "";
  return [...couriers].sort(
    (a, b) =>
      (threadOf(b.user_id)?.unread_count ?? 0) - (threadOf(a.user_id)?.unread_count ?? 0) ||
      at(b).localeCompare(at(a)) ||
      Number(isOnline(b)) - Number(isOnline(a)) ||
      a.name.localeCompare(b.name),
  );
}

function CourierChat({ courier }: { courier: AdminCourier }) {
  return (
    <>
      <header className="flex items-center gap-3">
        <span className={cn("avatar", !isOnline(courier) && "grayscale")} aria-hidden="true">
          {courier.name.charAt(0)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-bold leading-tight">{courier.name}</span>
          <span className="block truncate text-sm text-muted-foreground">
            {courier.current_order ? `Mengantar ${courier.current_order.code}` : courier.partner_name}
          </span>
        </span>
        <Presence online={isOnline(courier)} />
      </header>
      {!isOnline(courier) && <p className="notice">Kurir sedang offline. Pesan terbaca saat kurir membuka aplikasi.</p>}
      <OpenedChat key={courier.user_id} input={{ channel: "courier_admin", courier_id: courier.user_id }} />
    </>
  );
}

interface Props {
  channel: InboxChannel;
  threadId: string | null;
  courierId: string | null;
  onChannel: (channel: InboxChannel) => void;
  onThread: (id: string) => void;
  onCourier: (id: string) => void;
}

export function MessagesPage({ channel, threadId, courierId, onChannel, onThread, onCourier }: Props) {
  const { branchId } = useBranch();
  const threads = useChatThreads(channel);
  const couriers = useBranchCouriers();
  const unread = useUnreadChats();
  const swapX = useSwapX(INBOXES.findIndex((i) => i.id === channel));

  if (!branchId) return <p className="p-4 text-sm text-muted-foreground">Pilih cabang…</p>;

  const isCourier = channel === "courier_admin";
  const threadOf = (id: string) => threads.data?.find((t) => t.courier_id === id);
  const ranked = rankCouriers(couriers.data?.couriers ?? [], threadOf);
  // Only a courier who already has a conversation opens by itself: picking one for the admin would create an empty thread.
  const activeCourier = ranked.find((c) => c.user_id === courierId) ?? ranked.find((c) => threadOf(c.user_id)?.last_message);
  const selectedThread = threadId ?? threads.data?.[0]?.id ?? null;
  const loading = threads.isLoading || (isCourier && couriers.isLoading);
  const failed = threads.isError || (isCourier && couriers.isError);

  return (
    <div className="grid gap-4 p-4 lg:h-[calc(100dvh-5rem)] lg:grid-cols-[24rem_minmax(0,1fr)]">
      <section className="card flex min-h-0 flex-col gap-3 shadow-md">
        <h1 className="text-2xl font-bold">Pesan</h1>
        <Segmented
          label="Kotak pesan"
          value={channel}
          onChange={onChannel}
          items={INBOXES.map((inbox) => ({
            id: inbox.id,
            label: (
              <span className="flex items-center gap-2">
                {inbox.label}
                {unread[inbox.id] > 0 && <span className="count-badge static">{unread[inbox.id]}</span>}
              </span>
            ),
          }))}
        />
        {loading && <div className="skeleton h-16" role="status" aria-busy="true" aria-label="Memuat" />}
        {failed && (
          <p className="alert-box" role="alert">
            Gagal memuat pesan.
          </p>
        )}
        <ul key={channel} className="swap-in flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto" style={{ "--swap-x": swapX } as React.CSSProperties}>
          {isCourier
            ? ranked.map((c) => (
                <CourierRow
                  key={c.user_id}
                  courier={c}
                  thread={threadOf(c.user_id)}
                  selected={c.user_id === activeCourier?.user_id}
                  onClick={() => onCourier(c.user_id)}
                />
              ))
            : threads.data?.map((t) => <ThreadRow key={t.id} thread={t} selected={t.id === selectedThread} onClick={() => onThread(t.id)} />)}
          {!loading && !failed && (isCourier ? ranked.length === 0 : threads.data?.length === 0) && (
            <li className="empty-state my-auto">
              <p>{isCourier ? "Belum ada kurir di cabang ini." : "Pesan pelanggan muncul di sini setelah mereka menghubungi cabang."}</p>
            </li>
          )}
        </ul>
      </section>

      <section className="card flex min-h-[28rem] flex-col gap-3 shadow-md">
        {isCourier && activeCourier && <CourierChat key={activeCourier.user_id} courier={activeCourier} />}
        {!isCourier && selectedThread && <ChatPane key={selectedThread} threadId={selectedThread} showTitle />}
        {(isCourier ? !activeCourier : !selectedThread) && (
          <div className="empty-state m-auto w-full max-w-md">
            <p>{isCourier ? "Pilih kurir untuk mulai chat." : "Pilih percakapan untuk membalas."}</p>
          </div>
        )}
      </section>
    </div>
  );
}
