import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useSession } from "@/features/session/session";
import { LoginPage } from "@/features/session/LoginPage";
import { HomePage } from "@/features/tasks/HomePage";
import { OrderDetailPage } from "@/features/tasks/OrderDetailPage";
import { useMe, useOrders } from "@/features/tasks/hooks";
import { useForegroundPings, useWakeLock } from "@/tracking";
import { usePwaUpdate } from "@/pwa";

function UpdateBanner({ onDelivery }: { onDelivery: boolean }) {
  const { available, applyUpdate } = usePwaUpdate();
  if (!available) return null;
  return (
    <div className="flex items-center justify-between gap-3 bg-secondary p-3 text-sm">
      <span>{onDelivery ? "Versi baru tersedia. Perbarui setelah pengantaran selesai." : "Versi baru tersedia."}</span>
      <button
        type="button"
        disabled={onDelivery}
        onClick={applyUpdate}
        className="min-h-12 rounded-lg bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50"
      >
        Perbarui
      </button>
    </div>
  );
}

function Shell() {
  const me = useMe();
  const orders = useOrders();
  const active = orders.data?.active.find((o) => o.status === "ON_DELIVERY" || o.status === "PICKING");
  const hasOnDelivery = orders.data?.active.some((o) => o.status === "ON_DELIVERY") ?? false;
  const onDelivery = me.data?.status === "DELIVERING" || hasOnDelivery;

  useForegroundPings(me.data?.status, active?.id);
  useWakeLock(hasOnDelivery);

  return (
    <>
      <UpdateBanner onDelivery={onDelivery} />
      <Outlet />
    </>
  );
}

function ProtectedLayout() {
  const { user, loading } = useSession();
  if (loading) return <main className="p-4 text-muted-foreground">Memuat…</main>;
  if (!user) return <Navigate to="/login" replace />;
  return <Shell />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
