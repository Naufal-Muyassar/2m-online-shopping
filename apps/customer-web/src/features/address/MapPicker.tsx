import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const TILE_URL = import.meta.env.VITE_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = import.meta.env.VITE_MAP_ATTRIBUTION ?? "© OpenStreetMap contributors";

export interface LatLng {
  lat: number;
  lng: number;
}

interface Props {
  branch: LatLng & { radiusM: number };
  value: LatLng | null;
  onChange: (p: LatLng) => void;
}

export function MapPicker({ branch, value, onChange }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pin = useRef<L.CircleMarker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current).setView(value ?? branch, 14);
    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
    L.circle(branch, { radius: branch.radiusM, color: "#15803d", weight: 1, fillOpacity: 0.05, interactive: false }).addTo(m);
    L.circleMarker(branch, { radius: 5, color: "#15803d", fillOpacity: 1, interactive: false }).addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      pin.current = null;
    };
    // The map is created once per branch; the pin is synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch.lat, branch.lng, branch.radiusM]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!value) {
      pin.current?.remove();
      pin.current = null;
      return;
    }
    if (pin.current) pin.current.setLatLng(value);
    else pin.current = L.circleMarker(value, { radius: 9, color: "#dc2626", fillColor: "#dc2626", fillOpacity: 0.8 }).addTo(m);
  }, [value?.lat, value?.lng]);

  return <div ref={el} className="isolate h-72 w-full overflow-hidden rounded-lg border border-border shadow-md" role="application" aria-label="Peta pin alamat" />;
}
