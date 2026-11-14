import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { FaArrowRight, FaBoxOpen, FaCommentDots, FaHistory, FaMotorcycle, FaWallet } from "react-icons/fa";
import { BalanceAmount } from "@/features/balance/BalanceAmount";
import { unreadIn, useChatThreads } from "@/features/chat/hooks";
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

function BalanceBar() {
  return (
    <Link to="/balance" className="card card-link flex items-center gap-3 py-3">
      <span className="empty-state-icon size-11 text-lg">
        <FaWallet aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="font-bold">Saldo keuntungan</p>
        <p className="t-label mt-0.5 truncate">Tarik tunai di toko</p>
      </div>
      <BalanceAmount className="text-lg" />
      <FaArrowRight aria-hidden="true" className="row-arrow text-xs" />
    </Link>
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

// Four tiles share one frame and its hairlines, so the grid itself is the decoration.
function Tile({ icon, title, hint, to, onClick, badge = 0 }: TileProps) {
  const body = (
    <>
      <span className="flex items-start justify-between">
        <span className="text-xl text-primary">{icon}</span>
        <span className="relative flex text-xs">
          <FaArrowRight aria-hidden="true" className="-rotate-45 text-muted-foreground transition-colors duration-200 group-hover:text-foreground" />
          {badge > 0 && <span className="count-badge -right-3 -top-3">{badge}</span>}
        </span>
      </span>
      <span className="mt-5 block font-bold leading-tight">{title}</span>
      <span className="t-label mt-1 block">{hint}</span>
    </>
  );
  const className =
    "group block bg-surface p-3.5 text-left transition-colors duration-150 enabled:hover:bg-muted/50 enabled:active:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground [a&]:hover:bg-muted/50 [a&]:active:bg-muted";
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
  const adminUnread = unreadIn(useChatThreads(sessionReady).data, "courier_admin");

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
        <Skeleton className="h-16" />
        <Skeleton className="h-40" />
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
        <Link to="/profile" aria-label="Buka profil" className="avatar size-11 text-lg transition-transform duration-100 active:scale-95">
          {user.name.trim().charAt(0)}
        </Link>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="t-label">{greeting(new Date().getHours())}</p>
          <h1 className="truncate font-extrabold capitalize tracking-tight">{user.name}</h1>
        </div>
        <span className={`pill pill-dot ${pill?.className ?? ""}`}>{pill?.label ?? "…"}</span>
      </header>

      <main className="app-main">
        <section className="panel-ink flex animate-rise flex-col gap-5" aria-label="Status kerja">
          <div>
            <p className="t-headline">{panel?.title ?? "Memuat status…"}</p>
            <p className="mt-2 text-sm text-rail-muted">{panel?.hint}</p>
          </div>
          {status && !delivering && (
            <button
              type="button"
              disabled={setStatus.isPending}
              onClick={toggleStatus}
              className={cn("btn btn-lg btn-block", idle ? "btn-invert-outline" : "btn-invert")}
            >
              {setStatus.isPending ? "Memproses…" : idle ? "Berhenti bekerja" : "Mulai bekerja"}
            </button>
          )}
        </section>
        {setStatus.isError && <p role="alert" className="alert-box">{errorMessage(setStatus.error)}</p>}

        <BalanceBar />

        <section aria-labelledby="services-heading" className="flex flex-col gap-3">
          <div className="section-head">
            <h2 id="services-heading" className="t-title">
              Layanan
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border">
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
            <Tile icon={<FaCommentDots aria-hidden="true" />} title="Chat admin" hint="Tanya admin cabang" to="/chat/admin"badge={adminUnread} />
          </div>
        </section>

        {orders.isLoading && <LoadingBlock rows={1} />}
        {orders.isError && <ErrorCard message={errorMessage(orders.error)} onRetry={() => void orders.refetch()} />}

        {delivering && (
          <section className="flex flex-col gap-3" aria-labelledby="current-orders-heading">
            <div className="section-head">
              <h2 id="current-orders-heading" className="t-title">
                Pesanan saat ini
              </h2>
              <span className="t-label tabular-nums">{active.length}</span>
            </div>
            {active.map((o, i) => (
              <OrderCard key={o.id} order={o} index={i} />
            ))}
          </section>
        )}

        {idle && (
          <section id="available-jobs" className="flex scroll-mt-20 flex-col gap-3" aria-labelledby="available-jobs-heading">
            <div className="section-head">
              <h2 id="available-jobs-heading" className="t-title">
                Order tersedia
              </h2>
              <span className="t-label tabular-nums">{jobCount}</span>
            </div>
            <JobList />
          </section>
        )}
      </main>
    </>
  );
}
