import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const TILE_URL = import.meta.env.VITE_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = import.meta.env.VITE_MAP_ATTRIBUTION ?? "© OpenStreetMap contributors";

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  kind: "courier" | "destination";
}

const STYLE: Record<MapMarker["kind"], L.CircleMarkerOptions> = {
  courier: { radius: 9, color: "#1d4ed8", fillColor: "#2563eb", fillOpacity: 0.9 },
  destination: { radius: 9, color: "#dc2626", fillColor: "#dc2626", fillOpacity: 0.8 },
};

interface Props {
  markers: MapMarker[];
  ariaLabel?: string;
  className?: string;
}

// `markers` must keep the same identity until a coordinate changes (memoise it): each new array refits the view.
export function MapView({ markers, ariaLabel = "Peta", className = "h-64 w-full rounded-lg border" }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef(new Map<string, L.CircleMarker>());

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current).setView([0, 0], 2);
    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
    map.current = m;
    const current = layers.current;
    return () => {
      m.remove();
      map.current = null;
      current.clear();
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const ids = new Set(markers.map((k) => k.id));
    for (const [id, layer] of layers.current) {
      if (!ids.has(id)) {
        layer.remove();
        layers.current.delete(id);
      }
    }
    for (const k of markers) {
      const existing = layers.current.get(k.id);
      if (existing) existing.setLatLng([k.lat, k.lng]);
      else layers.current.set(k.id, L.circleMarker([k.lat, k.lng], STYLE[k.kind]).addTo(m));
    }
    if (markers.length === 1) m.setView([markers[0]!.lat, markers[0]!.lng], 15);
    else if (markers.length > 1) {
      m.fitBounds(L.latLngBounds(markers.map((k) => [k.lat, k.lng] as [number, number])), { padding: [32, 32], maxZoom: 17 });
    }
  }, [markers]);

  return <div ref={el} className={className} role="application" aria-label={ariaLabel} />;
}
