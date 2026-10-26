import { useState } from "react";
import { useAuth } from "../lib/auth";
import { cn } from "../lib/utils";
import { LoginPage } from "../features/auth/LoginPage";
import { BranchProvider, useBranch } from "../features/branch-config/BranchProvider";
import { CouriersTab } from "../features/couriers/CouriersTab";
import { LiveBoard } from "../features/live-board/LiveBoard";

type TabId = "board" | "couriers" | "short-pick" | "cash" | "config";

const TABS: { id: TabId; label: string; soon?: boolean }[] = [
  { id: "board", label: "Live Board" },
  { id: "couriers", label: "Kurir" },
  { id: "short-pick", label: "Short Pick", soon: true },
  { id: "cash", label: "Kas COD", soon: true },
  { id: "config", label: "Config Cabang", soon: true },
];

function Shell() {
  const { user, logout } = useAuth();
  const { branchId, branches, setBranchId } = useBranch();
  const [tab, setTab] = useState<TabId>("board");

  return (
    <div className="min-h-dvh">
      <header className="app-header flex-wrap gap-x-4">
        <h1 className="text-lg font-bold">2M Admin</h1>
        <nav className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              disabled={t.soon}
              onClick={() => setTab(t.id)}
              className={cn(
                "min-h-11 rounded-full px-4 text-sm transition-colors",
                tab === t.id
                  ? "bg-primary-surface font-bold text-primary-pressed"
                  : "text-muted-foreground hover:bg-muted",
                t.soon && "cursor-not-allowed opacity-60 hover:bg-transparent",
              )}
            >
              {t.label}
              {t.soon && <span className="ml-1 text-xs">(segera)</span>}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {user?.role === "super_admin" && (
            <select
              className="field w-auto"
              value={branchId ?? ""}
              onChange={(e) => setBranchId(e.target.value)}
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
          <button
            className="min-h-11 rounded-full border bg-surface px-4 font-medium hover:bg-muted"
            onClick={() => void logout()}
          >
            Keluar
          </button>
        </div>
      </header>
      {tab === "board" && <LiveBoard />}
      {tab === "couriers" && <CouriersTab />}
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
