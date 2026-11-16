import { useRef, useState, type ComponentType, type SVGProps } from "react";
import { IconBoard, IconCash, IconChat, IconClipboard, IconRefund, IconSearch, IconSettings, IconStore, IconTruck, IconWallet } from "../components/Icons";
import { Select } from "../components/Select";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { useThumb } from "../components/Segmented";
import { useAuth } from "../lib/auth";
import { cn } from "../lib/utils";
import { LoginPage } from "../features/auth/LoginPage";
import { BranchProvider, useBranch } from "../features/branch-config/BranchProvider";
import { ConfigPage } from "../features/branch-config/ConfigPage";
import { useUnreadChats } from "../features/chat/hooks";
import { MessagesPage, type InboxChannel } from "../features/chat/MessagesPage";
import { BalanceTab } from "../features/couriers/BalanceTab";
import { CouriersTab } from "../features/couriers/CouriersTab";
import { LiveBoard } from "../features/live-board/LiveBoard";
import { RefundsPage, useRefunds } from "../features/refunds/RefundsPage";

type TabId = "board" | "couriers" | "balance" | "refunds" | "messages" | "short-pick" | "cash" | "config";

const TABS: { id: TabId; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>>; soon?: boolean }[] = [
  { id: "board", label: "Tracking", Icon: IconBoard },
  { id: "couriers", label: "Kurir", Icon: IconTruck },
  { id: "balance", label: "Saldo", Icon: IconWallet },
  { id: "refunds", label: "Refund", Icon: IconRefund },
  { id: "messages", label: "Pesan", Icon: IconChat },
  { id: "short-pick", label: "Short Pick", Icon: IconClipboard, soon: true },
  { id: "cash", label: "Kas COD", Icon: IconCash, soon: true },
  { id: "config", label: "Config", Icon: IconSettings },
];

function Shell() {
  const { user, logout } = useAuth();
  const { branchId, branches, setBranchId } = useBranch();
  const [tab, setTab] = useState<TabId>("board");
  const [search, setSearch] = useState("");
  const [inbox, setInbox] = useState<InboxChannel>("customer_admin");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [courierId, setCourierId] = useState<string | null>(null);
  const nav = useRef<HTMLElement>(null);
  const thumb = useThumb(nav, "[aria-current='page']", tab);
  const unread = useUnreadChats();
  const unreadTotal = unread.customer_admin + unread.courier_admin;
  // Refunds the customer already gave an account for: money the branch has to send now.
  const refundsToPay = (useRefunds("open", 60_000).data ?? []).filter((r) => r.status === "READY").length;

  const openCourierChat = (id: string) => {
    setInbox("courier_admin");
    setCourierId(id);
    setTab("messages");
  };

  return (
    <div className="flex min-h-dvh flex-col pb-24 md:flex-row md:pb-0">
      <nav
        ref={nav}
        aria-label="Navigasi utama"
        className="rail fixed inset-x-3 bottom-3 z-[700] flex gap-1 rounded-[1.125rem] bg-rail p-1.5 shadow-nav md:sticky md:inset-x-auto md:bottom-auto md:top-0 md:h-dvh md:w-[5.5rem] md:shrink-0 md:flex-col md:rounded-none md:p-2 md:py-4 md:shadow-none"
      >
        <span aria-hidden="true" className="segmented-thumb rounded-xl bg-rail-foreground shadow-none" data-ready={thumb.ready} style={thumb.style} />
        <span
          aria-hidden="true"
          className="mx-auto mb-5 hidden size-11 items-center justify-center rounded-md bg-rail-foreground text-base font-extrabold tracking-tight text-rail md:flex"
        >
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
              "relative z-[1] min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[0.6875rem] font-bold transition-[color,transform] duration-150 active:scale-[0.96] md:min-h-[3.75rem] md:flex-none",
              soon ? "hidden cursor-not-allowed opacity-40 active:scale-100 md:flex" : "flex",
              tab === id ? "text-rail" : "text-rail-muted hover:text-rail-foreground",
            )}
          >
            <Icon className="text-xl" />
            {label}
            {id === "messages" && unreadTotal > 0 && <span className="count-badge right-2 top-1">{unreadTotal}</span>}
            {id === "refunds" && refundsToPay > 0 && <span className="count-badge right-2 top-1">{refundsToPay}</span>}
          </button>
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-2.5 md:px-6">
          {tab === "board" && (
            <div className="relative order-last w-full sm:order-none sm:w-auto sm:min-w-56 sm:flex-1 md:max-w-md">
              <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lg text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari kode order atau penerima…"
                aria-label="Cari order"
                className="field pl-10"
              />
            </div>
          )}
          <div className="ml-auto flex min-w-0 items-center gap-3 text-sm">
            {user?.role === "super_admin" && (
              <Select
                label="Cabang"
                icon={<IconStore />}
                align="end"
                className="max-w-[12rem] sm:max-w-[16rem]"
                value={branchId ?? ""}
                options={branches.map((b) => ({ value: b.id, label: b.name, hint: b.is_active ? undefined : "Nonaktif" }))}
                onChange={(id) => {
                  setThreadId(null);
                  setCourierId(null);
                  setBranchId(id);
                }}
              />
            )}
            <span className="avatar" aria-hidden="true">
              {user?.name?.charAt(0)}
            </span>
            <span className="hidden max-w-40 truncate font-bold lg:inline">{user?.name}</span>
            <button className="btn btn-secondary" onClick={() => void logout()}>
              Keluar
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1">
          <ErrorBoundary key={tab}>
            {tab === "board" && <LiveBoard search={search} />}
            {tab === "couriers" && <CouriersTab onOpenChat={openCourierChat} />}
            {tab === "balance" && <BalanceTab />}
            {tab === "refunds" && <RefundsPage />}
            {tab === "config" && <ConfigPage />}
            {tab === "messages" && (
              <MessagesPage
                channel={inbox}
                threadId={threadId}
                courierId={courierId}
                onChannel={(channel) => {
                  setInbox(channel);
                  setThreadId(null);
                }}
                onThread={setThreadId}
                onCourier={setCourierId}
              />
            )}
          </ErrorBoundary>
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
