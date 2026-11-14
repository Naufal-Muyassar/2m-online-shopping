import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "@2m/map/map.css";

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

// Shapes take their colour from the map-* classes in @2m/map, so the picker follows the palette tokens.
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
    m.attributionControl.setPrefix(false);
    L.circle(branch, { radius: branch.radiusM, className: "map-area", interactive: false }).addTo(m);
    L.circleMarker(branch, { radius: 5, className: "map-area-center", interactive: false }).addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      pin.current = null;
    };
    // The map is created once per branch; the pin is synced below.
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
    else pin.current = L.circleMarker(value, { radius: 9, className: "map-pick" }).addTo(m);
  }, [value?.lat, value?.lng]);

  return (
    <div
      ref={el}
      className="map-2m isolate h-72 w-full overflow-hidden rounded-lg border border-border lg:h-full lg:min-h-[26rem]"
      role="application"
      aria-label="Peta pin alamat"
    />
  );
}
