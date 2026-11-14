import { useMemo, useSyncExternalStore, type CSSProperties } from "react";
import { MapView, type MapMarker } from "@2m/map";
import { TRACKING_STALE_SEC, haversineKm, type AdminCourier, type AdminOrder, type BranchesResponse } from "@2m/shared";
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
      }
      return out;
    }
    for (const c of couriers) {
      if (c.position) out.push({ id: c.user_id, kind: "courier", ...c.position, label: c.name, live: isFresh(c.last_ping_at) });
    }
    return out;
  }, [branch, order, courier, courierPos, couriers]);

  const online = couriers.filter(isOnline).length;
  const distance = order && courierPos ? haversineKm(courierPos, order.destination) : null;

  return (
    <>
      <MapView
        markers={markers}
        route={!order ? undefined : courierPos ? COURIER_ROUTE : BRANCH_ROUTE}
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
            <p className="truncate font-extrabold leading-tight tracking-tight">{courier ? courier.name : "Belum ada kurir"}</p>
            <p className="truncate text-sm text-muted-foreground">
              {distance !== null ? `${distance.toLocaleString("id-ID", { maximumFractionDigits: 1 })} km garis lurus ke tujuan` : `Tujuan ${order.receiver_name}`}
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
