/// <reference types="vite/client" />
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./map.css";

const TILE_URL = import.meta.env.VITE_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = import.meta.env.VITE_MAP_ATTRIBUTION ?? "© OpenStreetMap contributors";
const FALLBACK: LatLng = { lat: -6.2, lng: 106.8166 };

export interface LatLng {
  lat: number;
  lng: number;
}

interface Props {
  // The service circle. It may move: the branch editor centres it on the pin.
  area?: (LatLng & { radiusM: number }) | null;
  value: LatLng | null;
  onChange: (p: LatLng) => void;
  // Required: Tailwind does not scan this package, so size and shape must come from the app.
  className: string;
  ariaLabel?: string;
  // Refit the view to the circle whenever its size changes.
  fitArea?: boolean;
}

// Tap to place the pin. Shapes take their colour from the map-* classes, so the picker follows the palette tokens.
export function MapPicker({ area, value, onChange, className, ariaLabel = "Peta pilih titik", fitArea = false }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pin = useRef<L.CircleMarker | null>(null);
  const circle = useRef<L.Circle | null>(null);
  const centre = useRef<L.CircleMarker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current).setView(value ?? area ?? FALLBACK, 14);
    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
    m.attributionControl.setPrefix(false);
    m.on("click", (e: L.LeafletMouseEvent) => onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
    map.current = m;
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(el.current);
    return () => {
      resize.disconnect();
      m.remove();
      map.current = null;
      pin.current = null;
      circle.current = null;
      centre.current = null;
    };
    // The map is created once; the shapes are synced below.
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!area) {
      circle.current?.remove();
      centre.current?.remove();
      circle.current = centre.current = null;
      return;
    }
    if (circle.current) {
      circle.current.setLatLng(area).setRadius(area.radiusM);
      centre.current?.setLatLng(area);
    } else {
      circle.current = L.circle(area, { radius: area.radiusM, className: "map-area", interactive: false }).addTo(m);
      centre.current = L.circleMarker(area, { radius: 5, className: "map-area-center", interactive: false }).addTo(m);
    }
  }, [area?.lat, area?.lng, area?.radiusM]);

  useEffect(() => {
    if (!fitArea || !map.current || !circle.current) return;
    map.current.fitBounds(circle.current.getBounds(), { padding: [24, 24] });
  }, [fitArea, area?.radiusM]);

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
    // Pan, never zoom, when the pin was moved from outside the map (typed coordinates).
    if (!m.getBounds().contains(value)) m.panTo(value);
  }, [value?.lat, value?.lng]);

  return <div ref={el} className={`map-2m ${className}`} role="application" aria-label={ariaLabel} />;
}
