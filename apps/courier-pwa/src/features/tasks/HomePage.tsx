import { useSession } from "@/features/session/session";
import { SideBarNavigation } from "@/components/SideBarNavigation";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorCard, LoadingBlock, Skeleton } from "@/components/ui/feedback";
import { FaCheckCircle, FaMoon, FaPlay } from "react-icons/fa";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api";
import { useMe, useOrders, useSetCourierStatus } from "./hooks";
import { OrderCard } from "./OrderCard";
import { LoggedOutDashboard } from "./LoggedOutDashboard";
import { JobList } from "./JobList";

const STATUS_PILL: Record<string, { label: string; className: string }> = {
  IDLE: { label: "Siap", className: "pill-success" },
  DELIVERING: { label: "Sedang mengantar", className: "pill-primary" },
  OFFLINE: { label: "Offline", className: "" },
};

export function HomePage() {
  const { user, loading } = useSession();
  const { notify } = useToast();
  const sessionReady = !loading && user !== null;
  const me = useMe(sessionReady);
  const orders = useOrders(sessionReady);
  const setStatus = useSetCourierStatus();

  const status = me.data?.status;
  const delivering = status === "DELIVERING";
  const toggleFromNavigation = () => {
    if (!status || delivering) return;
    const next = status === "OFFLINE" ? "IDLE" : "OFFLINE";
    setStatus.mutate(next, {
      onSuccess: () => notify("success", next === "IDLE" ? "Anda sekarang siap menerima pesanan." : "Anda sekarang offline."),
      onError: (err) => notify("error", errorMessage(err)),
    });
  };

  const startWorking = () => {
    if (status !== "OFFLINE") return;
    setStatus.mutate("IDLE", {
      onSuccess: () => notify("success", "Anda sekarang siap menerima pesanan."),
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

  return (
    <>
      <header className="app-header">
        <SideBarNavigation
          isLoggedIn
          name={user?.name}
          status={status}
          pending={setStatus.isPending}
          onToggleStatus={toggleFromNavigation}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Halo,</p>
          <h1 className="truncate text-lg font-bold capitalize">{user?.name}</h1>
        </div>
        <span className={`pill pill-dot ${pill?.className ?? ""}`}>{pill?.label ?? "…"}</span>
      </header>

      <main className="app-main">
        {status === "OFFLINE" && (
          <Button variant="hero" loading={setStatus.isPending} onClick={startWorking}>
            <FaPlay aria-hidden="true" className="mr-2 inline" />
            Mulai bekerja
          </Button>
        )}
        {setStatus.isError && <p role="alert" className="alert-box">{errorMessage(setStatus.error)}</p>}

        <section className="flex flex-col gap-3" aria-labelledby="current-orders-heading">
          <h2 id="current-orders-heading" className="text-lg font-bold">
            Pesanan saat ini
          </h2>
          {orders.isLoading && <LoadingBlock rows={1} />}
          {orders.isError && <ErrorCard message={errorMessage(orders.error)} onRetry={() => void orders.refetch()} />}
          {status === "OFFLINE" && (
            <EmptyState
              icon={<FaMoon />}
              title="Anda offline"
              hint="Ubah ke siap untuk melihat order yang tersedia."
            />
          )}
          {delivering && orders.data?.active.map((o, i) => <OrderCard key={o.id} order={o} index={i} />)}
          {status === "IDLE" && orders.data && orders.data.active.length === 0 && (
            <EmptyState icon={<FaCheckCircle />} title="Belum ada pesanan" hint="Pesanan yang Anda ambil akan muncul di sini." />
          )}
        </section>

        {status === "IDLE" && (
          <section className="flex flex-col gap-3" aria-labelledby="available-jobs-heading">
            <h2 id="available-jobs-heading" className="text-lg font-bold">
              Order tersedia
            </h2>
            <JobList />
          </section>
        )}

        <section className="flex flex-col gap-3" aria-labelledby="recent-orders-heading">
          <h2 id="recent-orders-heading" className="text-lg font-bold">
            10 terakhir selesai
          </h2>
          {orders.data?.recent.slice(0, 10).map((o, i) => <OrderCard key={o.id} order={o} index={i} />)}
          {orders.data && orders.data.recent.length === 0 && <p className="text-sm text-muted-foreground">Belum ada.</p>}
        </section>
      </main>
    </>
  );
}
