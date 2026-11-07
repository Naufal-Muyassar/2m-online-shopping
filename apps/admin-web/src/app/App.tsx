import { useState, type ComponentType, type SVGProps } from "react";
import { IconBoard, IconCash, IconChat, IconClipboard, IconSearch, IconSettings, IconTruck } from "../components/Icons";
import { useAuth } from "../lib/auth";
import { cn } from "../lib/utils";
import { LoginPage } from "../features/auth/LoginPage";
import { BranchProvider, useBranch } from "../features/branch-config/BranchProvider";
import { useUnreadChats } from "../features/chat/hooks";
import { MessagesPage, type InboxChannel } from "../features/chat/MessagesPage";
import { CouriersTab } from "../features/couriers/CouriersTab";
import { LiveBoard } from "../features/live-board/LiveBoard";

type TabId = "board" | "couriers" | "messages" | "short-pick" | "cash" | "config";

const TABS: { id: TabId; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>>; soon?: boolean }[] = [
  { id: "board", label: "Tracking", Icon: IconBoard },
  { id: "couriers", label: "Kurir", Icon: IconTruck },
  { id: "messages", label: "Pesan", Icon: IconChat },
  { id: "short-pick", label: "Short Pick", Icon: IconClipboard, soon: true },
  { id: "cash", label: "Kas COD", Icon: IconCash, soon: true },
  { id: "config", label: "Config", Icon: IconSettings, soon: true },
];

function Shell() {
  const { user, logout } = useAuth();
  const { branchId, branches, setBranchId } = useBranch();
  const [tab, setTab] = useState<TabId>("board");
  const [search, setSearch] = useState("");
  const [inbox, setInbox] = useState<InboxChannel>("customer_admin");
  const [threadId, setThreadId] = useState<string | null>(null);
  const unread = useUnreadChats();
  const unreadTotal = unread.customer_admin + unread.courier_admin;

  const openCourierChat = (id: string) => {
    setInbox("courier_admin");
    setThreadId(id);
    setTab("messages");
  };

  return (
    <div className="flex min-h-dvh flex-col pb-20 md:flex-row md:pb-0">
      <nav
        aria-label="Navigasi utama"
        className="fixed inset-x-0 bottom-0 z-20 flex gap-1 overflow-x-auto border-t bg-surface p-2 md:sticky md:top-0 md:h-dvh md:w-24 md:shrink-0 md:flex-col md:border-r md:border-t-0 md:py-4"
      >
        <span className="mx-auto mb-4 hidden size-12 items-center justify-center rounded-lg bg-hero font-bold text-primary-foreground md:flex">
          2M
        </span>
        {TABS.map(({ id, label, Icon, soon }) => (
          <button
            key={id}
            disabled={soon}
            title={soon ? `${label} (segera)` : label}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id)}
            className={cn(
              "relative flex min-h-14 min-w-16 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-xs transition-colors md:flex-none",
              tab === id ? "bg-primary font-bold text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              soon && "cursor-not-allowed opacity-50 hover:bg-transparent",
            )}
          >
            <Icon className="text-xl" />
            {label}
            {id === "messages" && unreadTotal > 0 && <span className="count-badge right-2 top-1">{unreadTotal}</span>}
          </button>
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-20 flex-wrap items-center gap-3 px-4 py-3">
          {tab === "board" && (
            <div className="relative min-w-56 flex-1 md:max-w-md">
              <IconSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari kode order atau penerima…"
                aria-label="Cari order"
                className="field rounded-full pl-11"
              />
            </div>
          )}
          <div className="ml-auto flex items-center gap-3 text-sm">
            {user?.role === "super_admin" && (
              <select
                className="field w-auto"
                value={branchId ?? ""}
                onChange={(e) => {
                  setThreadId(null);
                  setBranchId(e.target.value);
                }}
                aria-label="Cabang"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
            <span className="avatar" aria-hidden="true">
              {user?.name?.charAt(0)}
            </span>
            <span className="font-medium">{user?.name}</span>
            <button className="min-h-11 rounded-full border bg-surface px-4 font-medium hover:bg-muted" onClick={() => void logout()}>
              Keluar
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1">
          {tab === "board" && <LiveBoard search={search} />}
          {tab === "couriers" && <CouriersTab onOpenChat={openCourierChat} />}
          {tab === "messages" && (
            <MessagesPage
              channel={inbox}
              threadId={threadId}
              onChannel={(channel) => {
                setInbox(channel);
                setThreadId(null);
              }}
              onThread={setThreadId}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="grid min-h-dvh place-items-center p-4" role="status" aria-busy="true" aria-label="Memuat">
      <div className="skeleton h-24 w-full max-w-sm" />
    </div>
  );
}

export function App() {
  const { user, loading } = useAuth();
  if (loading) return <PageSkeleton />;
  if (!user) return <LoginPage />;
  return (
    <BranchProvider>
      <Shell />
    </BranchProvider>
  );
}
