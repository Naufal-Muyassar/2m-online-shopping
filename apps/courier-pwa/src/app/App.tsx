import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { LoginPage } from "@/features/session/LoginPage";
import { ProfilePage } from "@/features/session/ProfilePage";
import { HomePage } from "@/features/tasks/HomePage";
import { OrderDetailPage } from "@/features/tasks/OrderDetailPage";
import { useMe, useOrders } from "@/features/tasks/hooks";
import { useForegroundPings, useWakeLock } from "@/tracking";
import { usePwaUpdate } from "@/pwa";
import { FaSyncAlt } from "react-icons/fa";
import { useSession } from "@/features/session/session";

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
        className="min-h-12 rounded-lg bg-primary px-4 font-semibold text-primary-foreground transition duration-150 hover:brightness-95 active:scale-[0.99] disabled:opacity-50"
      >
        <FaSyncAlt aria-hidden="true" className="mr-2 inline" />
        Perbarui
      </button>
    </div>
  );
}

function Shell() {
  const { loading, user } = useSession();
  const sessionReady = !loading && user !== null;
  const me = useMe(sessionReady);
  const orders = useOrders(sessionReady);
  const active = orders.data?.active.find((o) => o.status === "ON_DELIVERY" || o.status === "ASSIGNED");
  const hasOnDelivery = orders.data?.active.some((o) => o.status === "ON_DELIVERY") ?? false;
  const onDelivery = me.data?.status === "DELIVERING" || hasOnDelivery;

  useForegroundPings(me.data?.status, active?.id, active?.status === "ON_DELIVERY");
  useWakeLock(hasOnDelivery);

  return (
    <>
      <UpdateBanner onDelivery={onDelivery} />
      <Outlet />
    </>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Shell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
