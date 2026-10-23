import { useSession } from "@/features/session/session";
import { SideBarNavigation } from "@/components/SideBarNavigation";
import { Button } from "@/components/ui/button";
import { FaPlay } from "react-icons/fa";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api";
import { useMe, useOrders, useSetCourierStatus } from "./hooks";
import { OrderCard } from "./OrderCard";

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

  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col gap-5 p-4">
      <header className="relative flex items-center gap-3">
        <SideBarNavigation
          name={user?.name}
          status={status}
          pending={setStatus.isPending}
          onToggleStatus={toggleFromNavigation}
        />
        <div>
          <h1 className="text-2xl font-bold">Halo, {user?.name}</h1>
          <p className="text-sm text-muted-foreground">
            Status: {status === "IDLE" ? "Siap" : status === "DELIVERING" ? "Sedang mengantar" : status === "OFFLINE" ? "Offline" : "…"}
          </p>
        </div>
      </header>

      {status === "OFFLINE" && (
        <Button loading={setStatus.isPending} onClick={startWorking}>
          <FaPlay aria-hidden="true" className="mr-2 inline" />
          Mulai bekerja
        </Button>
      )}
      {setStatus.isError && (
        <p role="alert" className="text-destructive">
          {errorMessage(setStatus.error)}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Pesanan saat ini</h2>
        {orders.isLoading && <p className="text-muted-foreground">Memuat…</p>}
        {orders.isError && (
          <p role="alert" className="text-destructive">
            {errorMessage(orders.error)}
          </p>
        )}
        {orders.data?.active.map((o) => <OrderCard key={o.id} order={o} />)}
        {orders.data && orders.data.active.length === 0 && (
          <p className="rounded-xl bg-muted p-4 text-muted-foreground">
            {status === "OFFLINE" ? "Anda offline. Ubah ke siap untuk menerima pesanan." : "Menunggu pesanan baru…"}
          </p>
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
