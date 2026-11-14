import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MapView, type MapMarker } from "@2m/map";
import { useTracking } from "../../lib/queries";

const ageSec = (iso: string, now: number) => Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));

export function TrackingCard({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const { data } = useTracking(orderId, true);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (data && !data.active) void qc.invalidateQueries({ queryKey: ["order", orderId] });
  }, [data, orderId, qc]);

  const active = data?.active ? data : null;
  const courier = active?.courier ?? null;
  const destination = active?.destination ?? null;
  const markers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    if (destination) out.push({ id: "destination", kind: "destination", lat: destination.lat, lng: destination.lng });
    if (courier) out.push({ id: "courier", kind: "courier", lat: courier.lat, lng: courier.lng });
    return out;
  }, [destination?.lat, destination?.lng, courier?.lat, courier?.lng]);

  if (!active) return null;
  const age = courier ? ageSec(courier.updated_at, now) : 0;

  return (
    <section className="card animate-rise overflow-hidden p-0 text-sm md:p-0">
      <MapView markers={markers} ariaLabel="Peta lokasi kurir" className="isolate h-64 w-full sm:h-80" />
      <div className="space-y-2 border-t border-border p-4">
        <h2 className="t-title">Lacak kurir</h2>
        {!courier || active.eta_minutes === null ? (
          <p className="text-muted-foreground">Menunggu lokasi kurir</p>
        ) : (
          <>
            <p className="font-bold">
              Kurir ±{active.eta_minutes} menit lagi (perkiraan)
              {active.distance_remaining_km !== null && (
                <span className="font-normal text-muted-foreground"> · {active.distance_remaining_km} km</span>
              )}
            </p>
            {active.stale ? (
              <p className="alert-box">Lokasi kurir belum diperbarui sejak {Math.max(1, Math.floor(age / 60))} menit</p>
            ) : (
              <p className="t-label tabular-nums">Diperbarui {age} detik lalu</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
