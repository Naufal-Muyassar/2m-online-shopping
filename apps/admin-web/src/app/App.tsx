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
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center gap-4 border-b px-4 py-2">
        <h1 className="font-semibold">2M Admin</h1>
        <nav className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              disabled={t.soon}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                tab === t.id ? "bg-primary text-primary-foreground" : "hover:bg-secondary",
                t.soon && "cursor-not-allowed opacity-50 hover:bg-transparent",
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
              className="rounded-md border px-2 py-1"
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
          <span>{user?.name}</span>
          <button className="rounded-md border px-2 py-1" onClick={() => void logout()}>
            Keluar
          </button>
        </div>
      </header>
      {tab === "board" && <LiveBoard />}
      {tab === "couriers" && <CouriersTab />}
    </div>
  );
}

export function App() {
  const { user, loading } = useAuth();
  if (loading) return <p className="p-4 text-sm">Memuat…</p>;
  if (!user) return <LoginPage />;
  return (
    <BranchProvider>
      <Shell />
    </BranchProvider>
  );
}
