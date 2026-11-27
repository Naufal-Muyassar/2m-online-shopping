import { useMemo, useSyncExternalStore, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapView, type MapMarker } from "@2m/map";
import { TRACKING_STALE_SEC, type AdminCourier, type AdminOrder, type BranchesResponse, type DeliveryRoute } from "@2m/shared";
import { api } from "../../lib/api";
import { useBranch } from "../branch-config/BranchProvider";
import { isOnline } from "../couriers/hooks";

const WIDE = "(min-width: 1280px)";
const subscribeWide = (cb: () => void) => {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", cb);
  return () => query.removeEventListener("change", cb);
};

const COURIER_ROUTE = ["courier", "destination"];
const BRANCH_ROUTE = ["branch", "destination"];
// The order panel floats over the right side of the map on wide screens; the right padding clears it plus its 12px inset and a margin.
const PANEL_CLEARANCE = 36;
const PADDING_NARROW: [number, number, number, number] = [88, 48, 48, 48];

function pingText(iso: string | null): string {
  if (!iso) return "Belum ada lokasi";
  const sec = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (sec < 60) return `Lokasi ${sec} dtk lalu`;
  if (sec < 3600) return `Lokasi ${Math.floor(sec / 60)} mnt lalu`;
  return `Lokasi ${Math.floor(sec / 3600)} jam lalu`;
}

const isFresh = (iso: string | null) => iso !== null && Date.now() - Date.parse(iso) < TRACKING_STALE_SEC * 1000;

// Active orders get a road route: from the courier once one is on the way, from the branch before that.
const ROUTED = new Set(["PAID", "ACCEPTED", "PICKING", "READY", "ASSIGNED", "ON_DELIVERY"]);
const ROUTE_POLL_MS = 15_000;

// Same stored road route the courier and the customer see; polling only re-measures it on the server.
function useOrderRoute(orderId: string | null, enabled: boolean) {
  const { branchId } = useBranch();
  return useQuery({
    queryKey: ["admin-order-route", branchId, orderId],
    enabled: enabled && !!orderId && !!branchId,
    queryFn: async () =>
      (await api.get<DeliveryRoute>(`/admin/orders/${orderId}/route`, { params: { branch_id: branchId } })).data,
    refetchInterval: ROUTE_POLL_MS,
  });
}

function distanceText(route: DeliveryRoute | undefined): string | null {
  if (!route || route.distance_km === null) return null;
  const km = route.distance_km.toLocaleString("id-ID", { maximumFractionDigits: 1 });
  if (route.origin === "branch") {
    return route.source === "road" ? `${km} km via jalan dari cabang` : `±${km} km dari cabang, perkiraan`;
  }
  const eta = route.eta_minutes !== null ? ` (±${route.eta_minutes} mnt)` : "";
  return route.source === "road" ? `${km} km via jalan ke tujuan${eta}` : `±${km} km ke tujuan${eta}, perkiraan`;
}

function unassignedTitle(couriers: AdminCourier[]): string {
  const onMap = couriers.filter((c) => c.position).length;
  const idle = couriers.filter((c) => c.status === "IDLE").length;
  if (onMap === 0) return "Belum ada kurir, tidak ada kurir online";
  return `Belum ada kurir, ${idle} siap dari ${onMap} di peta`;
}

interface Props {
  order: AdminOrder | null;
  couriers: AdminCourier[];
  branch: BranchesResponse["branches"][number] | null;
  /** Width of the floating order panel, in px. */
  panelWidth: number;
}

export function TrackingMap({ order, couriers, branch, panelWidth }: Props) {
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches);
  const hasPanel = wide && order !== null;
  const padding = useMemo<[number, number, number, number]>(
    () => (hasPanel ? [96, panelWidth + PANEL_CLEARANCE, 64, 64] : PADDING_NARROW),
    [hasPanel, panelWidth],
  );
  const courier = order?.assigned_courier ? (couriers.find((c) => c.user_id === order.assigned_courier?.user_id) ?? null) : null;
  const courierPos = courier?.position ?? null;

  const markers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    if (branch) out.push({ id: "branch", kind: "branch", lat: branch.lat, lng: branch.lng });
    if (order) {
      out.push({ id: "destination", kind: "destination", ...order.destination, label: order.receiver_name });
      if (courier && courierPos) {
        out.push({ id: "courier", kind: "courier", ...courierPos, label: courier.name, live: isFresh(courier.last_ping_at) });
      } else if (!order.assigned_courier) {
        // Still looking for a courier: show who is on duty and where, so the admin can see who is nearest.
        for (const c of couriers) {
          if (c.position) out.push({ id: c.user_id, kind: "courier", ...c.position, label: c.name, live: isFresh(c.last_ping_at) });
        }
      }
      return out;
    }
    for (const c of couriers) {
      if (c.position) out.push({ id: c.user_id, kind: "courier", ...c.position, label: c.name, live: isFresh(c.last_ping_at) });
    }
    return out;
  }, [branch, order, courier, courierPos, couriers]);

  const online = couriers.filter(isOnline).length;
  const routed = !!order && ROUTED.has(order.status);
  const route = useOrderRoute(order?.id ?? null, routed).data;
  // The road line only fits between the pins the map draws: courier → destination, or branch → destination.
  const fits = !!route && route.origin === (courierPos ? "courier" : "branch");
  const distance = routed && fits ? distanceText(route) : null;

  return (
    <>
      <MapView
        markers={markers}
        route={!order ? undefined : courierPos ? COURIER_ROUTE : BRANCH_ROUTE}
        routePath={routed && fits ? route?.path : null}
        fitKey={order?.id ?? "fleet"}
        fitPadding={padding}
        ariaLabel={order ? `Peta order ${order.code}` : "Peta kurir cabang"}
        className="absolute inset-0 isolate"
      />
      <div className="material-chip pointer-events-none absolute left-3 top-3 z-[500] max-w-[calc(100%-1.5rem)] rounded-lg px-4 py-2.5 xl:max-w-[calc(100%-var(--panel-w)-2.25rem)]"
        style={{ "--panel-w": `${order ? panelWidth : 0}px` } as CSSProperties}
      >
        {order ? (
          <>
            <p className="truncate font-extrabold leading-tight tracking-tight">
              {courier ? courier.name : (order.assigned_courier?.name ?? unassignedTitle(couriers))}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {courier || !distance ? (distance ?? `Tujuan ${order.receiver_name}`) : `Tujuan ${order.receiver_name}, ${distance}`}
              {courier ? `, ${pingText(courier.last_ping_at).toLowerCase()}` : ""}
            </p>
          </>
        ) : (
          <>
            <p className="truncate font-extrabold leading-tight tracking-tight">{branch?.name ?? "Cabang"}</p>
            <p className="truncate text-sm text-muted-foreground">
              {online} dari {couriers.length} kurir online
            </p>
          </>
        )}
      </div>
    </>
  );
}
