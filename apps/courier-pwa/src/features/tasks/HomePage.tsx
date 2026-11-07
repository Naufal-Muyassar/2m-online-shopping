import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { FaArrowRight, FaBoxOpen, FaCommentDots, FaHistory, FaMotorcycle, FaWallet } from "react-icons/fa";
import { useChatThreads } from "@/features/chat/hooks";
import { useSession } from "@/features/session/session";
import { ErrorCard, LoadingBlock, Skeleton } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useJobs, useMe, useOrders, useSetCourierStatus } from "./hooks";
import { OrderCard } from "./OrderCard";
import { LoggedOutDashboard } from "./LoggedOutDashboard";
import { JobList } from "./JobList";

const STATUS_PILL: Record<string, { label: string; className: string }> = {
  IDLE: { label: "Siap", className: "pill-success" },
  DELIVERING: { label: "Sedang mengantar", className: "pill-primary" },
  OFFLINE: { label: "Offline", className: "" },
};

const STATUS_PANEL: Record<string, { title: string; hint: string }> = {
  IDLE: { title: "Anda siap menerima order", hint: "Ambil order yang tersedia di bawah." },
  DELIVERING: { title: "Anda sedang mengantar", hint: "Selesaikan pesanan dulu sebelum berhenti bekerja." },
  OFFLINE: { title: "Anda offline", hint: "Mulai bekerja untuk melihat order yang tersedia." },
};

function greeting(hour: number): string {
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 18) return "Selamat sore";
  return "Selamat malam";
}

// Earnings withdrawal is planned; this slot shows no amount until the balance is real.
function BalanceBar() {
  return (
    <div className="flex min-h-16 items-center gap-3 rounded-full bg-surface p-2 pr-4 shadow-sm">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground text-lg text-surface">
        <FaWallet aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="font-bold">Saldo keuntungan</p>
        <p className="truncate text-xs text-muted-foreground">Nanti bisa ditarik di toko</p>
      </div>
      <span className="pill shrink-0">Segera</span>
    </div>
  );
}

interface TileProps {
  icon: ReactNode;
  title: string;
  hint: string;
  to?: string;
  onClick?: () => void;
  badge?: number;
}

function Tile({ icon, title, hint, to, onClick, badge = 0 }: TileProps) {
  const body = (
    <>
      <span className="flex items-start justify-between">
        <span className="flex size-11 items-center justify-center rounded-full bg-primary-surface text-primary">{icon}</span>
        <span className="relative flex size-9 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
          <FaArrowRight aria-hidden="true" className="-rotate-45" />
          {badge > 0 && <span className="count-badge -right-1 -top-1">{badge}</span>}
        </span>
      </span>
      <span className="mt-3 block font-bold">{title}</span>
      <span className="block text-xs text-muted-foreground">{hint}</span>
    </>
  );
  const className = "block rounded-2xl bg-surface p-3 text-left shadow-sm transition active:scale-[0.98] disabled:opacity-60";
  if (to) {
    return (
      <Link to={to} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className={className}>
      {body}
    </button>
  );
}

export function HomePage() {
  const { user, loading } = useSession();
  const { notify } = useToast();
  const sessionReady = !loading && user !== null;
  const me = useMe(sessionReady);
  const orders = useOrders(sessionReady);
  const setStatus = useSetCourierStatus();
  const status = me.data?.status;
  const delivering = status === "DELIVERING";
  const idle = status === "IDLE";
  const jobs = useJobs(sessionReady && idle);
  const adminUnread = useChatThreads("courier_admin", sessionReady).data?.reduce((n, t) => n + t.unread_count, 0) ?? 0;

  const toggleStatus = () => {
    if (!status || delivering) return;
    const next = status === "OFFLINE" ? "IDLE" : "OFFLINE";
    setStatus.mutate(next, {
      onSuccess: () => notify("success", next === "IDLE" ? "Anda sekarang siap menerima pesanan." : "Anda sekarang offline."),
      onError: (err) => notify("error", errorMessage(err)),
    });
  };

  if (loading) {
    return (
      <main aria-busy="true" aria-label="Memuat sesi" className="app-main">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
      </main>
    );
  }

  if (!user) return <LoggedOutDashboard />;

  const pill = status ? STATUS_PILL[status] : undefined;
  const panel = status ? STATUS_PANEL[status] : undefined;
  const active = orders.data?.active ?? [];
  const firstActive = active[0];
  const jobCount = jobs.data?.jobs.length ?? 0;

  return (
    <>
      <header className="app-header">
        <Link to="/profile" aria-label="Buka profil" className="avatar size-11 text-lg">
          {user.name.trim().charAt(0)}
        </Link>
        <div className="min-w-0 flex-1 leading-tight">
          <h1 className="truncate font-bold capitalize">{user.name}</h1>
          <p className="text-xs text-muted-foreground">{greeting(new Date().getHours())}</p>
        </div>
        <span className={`pill pill-dot ${pill?.className ?? ""}`}>{pill?.label ?? "…"}</span>
      </header>

      <main className="app-main">
        <BalanceBar />

        <section aria-labelledby="services-heading" className="flex flex-col gap-3">
          <h2 id="services-heading" className="text-lg font-bold">
            Layanan
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Tile
              icon={<FaBoxOpen aria-hidden="true" />}
              title="Order tersedia"
              hint={idle ? `${jobCount} order menunggu` : "Mulai bekerja dulu"}
              onClick={idle ? () => document.getElementById("available-jobs")?.scrollIntoView({ behavior: "smooth" }) : undefined}
            />
            <Tile
              icon={<FaMotorcycle aria-hidden="true" />}
              title="Pesanan aktif"
              hint={active.length > 0 ? `${active.length} sedang berjalan` : "Belum ada pesanan"}
              to={firstActive ? `/orders/${firstActive.id}` : undefined}
            />
            <Tile icon={<FaHistory aria-hidden="true" />} title="Riwayat" hint="10 terakhir selesai" to="/history" />
            <Tile icon={<FaCommentDots aria-hidden="true" />} title="Chat admin" hint="Tanya admin cabang" to="/chat" badge={adminUnread} />
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-2xl bg-foreground p-4 text-surface" aria-label="Status kerja">
          <div>
            <p className="text-lg font-bold">{panel?.title ?? "Memuat status…"}</p>
            <p className="text-sm opacity-80">{panel?.hint}</p>
          </div>
          {status && !delivering && (
            <button
              type="button"
              disabled={setStatus.isPending}
              onClick={toggleStatus}
              className={cn(
                "min-h-14 rounded-full text-lg font-bold transition active:scale-[0.97] disabled:opacity-60",
                idle ? "border border-surface/40 text-surface" : "bg-surface text-foreground",
              )}
            >
              {setStatus.isPending ? "Memproses…" : idle ? "Berhenti bekerja" : "Mulai bekerja"}
            </button>
          )}
        </section>
        {setStatus.isError && <p role="alert" className="alert-box">{errorMessage(setStatus.error)}</p>}

        {orders.isLoading && <LoadingBlock rows={1} />}
        {orders.isError && <ErrorCard message={errorMessage(orders.error)} onRetry={() => void orders.refetch()} />}

        {delivering && (
          <section className="flex flex-col gap-3" aria-labelledby="current-orders-heading">
            <h2 id="current-orders-heading" className="text-lg font-bold">
              Pesanan saat ini
            </h2>
            {active.map((o, i) => (
              <OrderCard key={o.id} order={o} index={i} />
            ))}
          </section>
        )}

        {idle && (
          <section id="available-jobs" className="flex scroll-mt-20 flex-col gap-3" aria-labelledby="available-jobs-heading">
            <h2 id="available-jobs-heading" className="text-lg font-bold">
              Order tersedia
            </h2>
            <JobList />
          </section>
        )}
      </main>
    </>
  );
}
