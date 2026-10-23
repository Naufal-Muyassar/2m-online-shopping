import { useSession } from "@/features/session/session";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api";
import { useMe, useOrders, useSetCourierStatus } from "./hooks";
import { OrderCard } from "./OrderCard";
import { JobList } from "./JobList";

export function HomePage() {
  const { user, logout } = useSession();
  const { notify } = useToast();
  const me = useMe();
  const orders = useOrders();
  const setStatus = useSetCourierStatus();

  const status = me.data?.status;
  const delivering = status === "DELIVERING";

  const toggle = () => {
    if (!status || delivering) return;
    const next = status === "OFFLINE" ? "IDLE" : "OFFLINE";
    setStatus.mutate(next, {
      onSuccess: () => notify("success", next === "IDLE" ? "Anda sekarang siap menerima pesanan." : "Anda sekarang offline."),
      onError: (err) => notify("error", errorMessage(err)),
    });
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Halo, {user?.name}</h1>
          <p className="text-sm text-muted-foreground">
            Status: {status === "IDLE" ? "Siap" : status === "DELIVERING" ? "Sedang mengantar" : status === "OFFLINE" ? "Offline" : "…"}
          </p>
        </div>
        <button type="button" className="min-h-12 px-3 text-base underline" onClick={() => void logout()}>
          Keluar
        </button>
      </header>

      <Button
        variant={status === "OFFLINE" ? "primary" : "secondary"}
        disabled={!status || delivering}
        loading={setStatus.isPending}
        onClick={toggle}
      >
        {delivering ? "Sedang mengantar" : status === "OFFLINE" ? "Mulai bekerja (IDLE)" : "Berhenti (OFFLINE)"}
      </Button>
      {setStatus.isError && (
        <p role="alert" className="text-destructive">
          {errorMessage(setStatus.error)}
        </p>
      )}

      <section className="flex flex-col gap-3">
        {status === "IDLE" && (
          <>
            <h2 className="text-lg font-bold">Job tersedia</h2>
            <JobList />
          </>
        )}
        {status === "OFFLINE" && (
          <>
            <h2 className="text-lg font-bold">Anda offline</h2>
            <p className="rounded-xl bg-muted p-4 text-muted-foreground">
              Anda offline. Ubah ke siap untuk melihat order yang tersedia.
            </p>
          </>
        )}
        {delivering && (
          <>
            <h2 className="text-lg font-bold">Pesanan saat ini</h2>
            {orders.isLoading && <p className="text-muted-foreground">Memuat…</p>}
            {orders.isError && (
              <p role="alert" className="text-destructive">
                {errorMessage(orders.error)}
              </p>
            )}
            {orders.data?.active.map((o) => <OrderCard key={o.id} order={o} />)}
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">10 terakhir selesai</h2>
        {orders.data?.recent.slice(0, 10).map((o) => <OrderCard key={o.id} order={o} />)}
        {orders.data && orders.data.recent.length === 0 && <p className="text-muted-foreground">Belum ada.</p>}
      </section>
    </main>
  );
}
