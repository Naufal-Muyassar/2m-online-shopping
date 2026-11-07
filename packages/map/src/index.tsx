/// <reference types="vite/client" />
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./map.css";

const TILE_URL = import.meta.env.VITE_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = import.meta.env.VITE_MAP_ATTRIBUTION ?? "© OpenStreetMap contributors";
const MOVE_MS = 900;
const DEFAULT_PADDING: [number, number, number, number] = [48, 48, 48, 48];

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  kind: "courier" | "destination" | "branch";
  // Shown under the pin. Set as text, so a user's name cannot inject markup.
  label?: string;
  // Adds the pulsing halo that says this position is being updated.
  live?: boolean;
}

interface Props {
  markers: MapMarker[];
  // Marker ids joined by a dashed line, in order.
  route?: string[];
  ariaLabel?: string;
  // Required: Tailwind does not scan this package, so size and shape must come from the app.
  className: string;
  // Changing this refits the view, for example when another order is selected.
  fitKey?: string;
  // Keeps pins clear of UI floating over the map: [top, right, bottom, left] in px.
  fitPadding?: [number, number, number, number];
}

const TRUCK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6.5h10.5v9H3zM13.5 10H18l3 3v2.5h-7.5z"/><circle cx="7.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>';
const SHOP =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v9.5h16V10M3 9.5 5 4h14l2 5.5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z"/><path d="M10 19.5v-5h4v5"/></svg>';
const DROP =
  '<svg viewBox="0 0 32 42"><path d="M16 1C7.7 1 1 7.7 1 16c0 11 15 25 15 25s15-14 15-25C31 7.7 24.3 1 16 1Z" fill="currentColor" stroke="#fff" stroke-width="2"/><circle cx="16" cy="16" r="5.5" fill="#fff"/></svg>';

const SIZE: Record<MapMarker["kind"], { size: [number, number]; anchor: [number, number]; glyph: string }> = {
  courier: { size: [44, 44], anchor: [22, 22], glyph: TRUCK },
  branch: { size: [36, 36], anchor: [18, 18], glyph: SHOP },
  destination: { size: [32, 42], anchor: [16, 41], glyph: DROP },
};

function pinIcon(k: MapMarker): L.DivIcon {
  const { size, anchor, glyph } = SIZE[k.kind];
  const root = document.createElement("div");
  root.className = `map-pin map-pin-${k.kind}`;
  if (k.live) root.classList.add("map-pin-live");
  // Glyphs are the constants above; only `label` comes from data and it goes through textContent.
  root.innerHTML = `<span class="map-pin-glyph">${glyph}</span>`;
  if (k.label) {
    const label = document.createElement("span");
    label.className = "map-pin-label";
    label.textContent = k.label;
    root.append(label);
  }
  return L.divIcon({ html: root, className: "map-pin-host", iconSize: size, iconAnchor: anchor });
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const iconKey = (k: MapMarker) => `${k.kind}|${k.label ?? ""}|${k.live ? 1 : 0}`;

export function MapView({
  markers,
  route,
  ariaLabel = "Peta",
  className,
  fitKey = "",
  fitPadding = DEFAULT_PADDING,
}: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pins = useRef(new Map<string, { marker: L.Marker; icon: string; frame: number }>());
  const line = useRef<L.Polyline | null>(null);
  const fitted = useRef<string | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const first = markers[0];
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView(
      first ? [first.lat, first.lng] : [-6.2, 106.8166],
      first ? 15 : 12,
    );
    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m);
    L.control.zoom({ position: "bottomleft" }).addTo(m);
    m.attributionControl.setPrefix(false);
    map.current = m;
    const resize = new ResizeObserver(() => {
      m.invalidateSize();
      // The next marker update refits for the new size.
      fitted.current = null;
    });
    resize.observe(el.current);
    const current = pins.current;
    return () => {
      resize.disconnect();
      for (const pin of current.values()) cancelAnimationFrame(pin.frame);
      m.remove();
      map.current = null;
      line.current = null;
      fitted.current = null;
      current.clear();
    };
    // The map is created once; markers are synced by the effect below.
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;

    const drawRoute = () => {
      const points = (route ?? []).flatMap((id) => {
        const pin = pins.current.get(id);
        return pin ? [pin.marker.getLatLng()] : [];
      });
      if (points.length < 2) {
        line.current?.remove();
        line.current = null;
      } else if (line.current) line.current.setLatLngs(points);
      else line.current = L.polyline(points, { className: "map-route", interactive: false }).addTo(m);
    };

    const ids = new Set(markers.map((k) => k.id));
    for (const [id, pin] of pins.current) {
      if (ids.has(id)) continue;
      cancelAnimationFrame(pin.frame);
      pin.marker.remove();
      pins.current.delete(id);
    }

    for (const k of markers) {
      const pin = pins.current.get(k.id);
      if (!pin) {
        const marker = L.marker([k.lat, k.lng], { icon: pinIcon(k), keyboard: false, interactive: false, zIndexOffset: k.kind === "courier" ? 500 : 0 });
        pins.current.set(k.id, { marker: marker.addTo(m), icon: iconKey(k), frame: 0 });
        continue;
      }
      if (pin.icon !== iconKey(k)) {
        pin.marker.setIcon(pinIcon(k));
        pin.icon = iconKey(k);
      }
      // Starts from the on-screen position, so a new fix redirects a move that is still running.
      const from = pin.marker.getLatLng();
      if (from.lat === k.lat && from.lng === k.lng) continue;
      cancelAnimationFrame(pin.frame);
      if (reducedMotion()) {
        pin.marker.setLatLng([k.lat, k.lng]);
        continue;
      }
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / MOVE_MS);
        const eased = 1 - (1 - t) ** 3;
        pin.marker.setLatLng([from.lat + (k.lat - from.lat) * eased, from.lng + (k.lng - from.lng) * eased]);
        drawRoute();
        if (t < 1) pin.frame = requestAnimationFrame(step);
      };
      pin.frame = requestAnimationFrame(step);
    }
    drawRoute();

    const key = `${fitKey}:${[...ids].sort().join(",")}`;
    const bounds = L.latLngBounds(markers.map((k) => [k.lat, k.lng] as [number, number]));
    const outside = bounds.isValid() && !m.getBounds().contains(bounds);
    if (markers.length === 0 || (fitted.current === key && !outside)) return;
    fitted.current = key;
    const [top, right, bottom, left] = fitPadding;
    m.fitBounds(bounds, {
      paddingTopLeft: [left, top],
      paddingBottomRight: [right, bottom],
      maxZoom: markers.length === 1 ? 15 : 16,
      animate: !reducedMotion(),
    });
  }, [markers, route, fitKey, fitPadding]);

  return <div ref={el} className={`map-2m ${className}`} role="application" aria-label={ariaLabel} />;
}
