import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { MapView, type MapMarker } from "@2m/map";
import type { OrderStatus, TrackingResponse } from "@2m/shared";
import { useTracking } from "../../lib/queries";
import { cn } from "../../lib/utils";
import { IconBack, IconExpand, IconLocate, IconPin } from "../../components/Icons";
import { StatusPill } from "../../components/StatusPill";
import { CourierChatButton } from "./CourierChatButton";

type ActiveTracking = Extract<TrackingResponse, { active: true }>;

interface Props {
  orderId: string;
  orderCode: string;
  status: OrderStatus;
  courierName: string | null;
  destination: { label: string; street: string };
}

// The fullscreen view lives in the URL, so the phone's back gesture closes it instead of leaving the order.
const FULL_PARAM = "lacak";
const NEAR_KM = 0.2;
const ROUTE = ["courier", "destination"];

const ageSec = (iso: string, now: number) => Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
const ageText = (sec: number) => (sec < 60 ? `${sec} detik lalu` : `${Math.floor(sec / 60)} menit lalu`);

// What the courier is doing, in words: the same sentence on the card and in the fullscreen panel.
function describe(t: ActiveTracking, age: number) {
  if (!t.courier) return { title: "Menunggu lokasi kurir", hint: "Peta bergerak begitu kurir mengirim lokasinya." };
  if (t.stale) return { title: "Lokasi kurir terputus", hint: `Posisi terakhir ${ageText(age)}. Kurir tetap menuju alamat Anda.` };
  if (t.distance_remaining_km !== null && t.distance_remaining_km <= NEAR_KM) {
    return { title: "Kurir hampir sampai", hint: "Siapkan diri untuk menerima pesanan." };
  }
  return { title: "Kurir menuju alamat Anda", hint: "Posisi kurir diperbarui otomatis." };
}

function useWide() {
  const query = "(min-width: 768px)";
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

function Freshness({ t, age }: { t: ActiveTracking; age: number }) {
  if (!t.courier) return null;
  return (
    <p className={cn("flex items-center gap-2 tabular-nums", t.stale ? "font-semibold text-destructive" : "t-label")}>
      {t.stale ? <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-destructive" /> : <span aria-hidden="true" className="live-dot" />}
      {t.stale ? `Belum diperbarui sejak ${ageText(age)}` : `Diperbarui ${ageText(age)}`}
    </p>
  );
}

function Figures({ t }: { t: ActiveTracking }) {
  const eta = t.courier && t.eta_minutes !== null ? `±${t.eta_minutes}` : "–";
  const km = t.distance_remaining_km !== null ? t.distance_remaining_km.toLocaleString("id-ID") : "–";
  return (
    <dl className="grid grid-cols-2 gap-3">
      <div>
        <dt className="t-label">Perkiraan tiba</dt>
        <dd className="mt-0.5 text-2xl font-extrabold tracking-tight tabular-nums">
          {eta} <span className="text-sm font-semibold text-muted-foreground">menit</span>
        </dd>
      </div>
      <div>
        <dt className="t-label">{t.distance_source === "road" ? "Jarak tersisa via jalan" : "Perkiraan jarak"}</dt>
        <dd className="mt-0.5 text-2xl font-extrabold tracking-tight tabular-nums">
          {km} <span className="text-sm font-semibold text-muted-foreground">km</span>
        </dd>
      </div>
    </dl>
  );
}

function FullscreenTracking({
  t,
  age,
  markers,
  onClose,
  ...order
}: Props & { t: ActiveTracking; age: number; markers: MapMarker[]; onClose: () => void }) {
  const wide = useWide();
  const back = useRef<HTMLButtonElement>(null);
  const [fit, setFit] = useState(0);
  const { title, hint } = describe(t, age);
  // Keeps both pins clear of the panel: on the right from 768px, along the bottom on a phone.
  const padding = useMemo<[number, number, number, number]>(() => (wide ? [96, 416, 64, 64] : [88, 40, 360, 40]), [wide]);

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    back.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      root.style.overflow = prevOverflow;
      prevFocus?.focus();
    };
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Lacak kurir" className="map-fullscreen">
      <MapView markers={markers} route={ROUTE} routePath={t.route_path} ariaLabel="Peta lokasi kurir" className="absolute inset-0 isolate" fitKey={`full-${fit}`} fitPadding={padding} />

      <div className="map-fullscreen-bar">
        <button ref={back} type="button" onClick={onClose} className="material-chip map-chip-btn">
          <IconBack className="text-lg" />
          Kembali
        </button>
        <button type="button" onClick={() => setFit((n) => n + 1)} aria-label="Pusatkan peta" title="Pusatkan peta" className="material-chip map-chip-btn map-chip-icon">
          <IconLocate className="text-lg" />
        </button>
      </div>

      <section className="material map-fullscreen-panel" aria-live="polite">
        <div className="flex items-center justify-between gap-3">
          <StatusPill status={order.status} />
          <span className="t-label tabular-nums">{order.orderCode}</span>
        </div>
        <div>
          <h2 className="t-title">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
        </div>
        <Figures t={t} />
        <Freshness t={t} age={age} />
        <div className="space-y-3 border-t border-border pt-3 text-sm">
          {order.courierName && (
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="avatar">
                {order.courierName.charAt(0)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{order.courierName}</p>
                <p className="t-label">Kurir 2M</p>
              </div>
              <CourierChatButton orderId={order.orderId} label="Chat" className="btn-sm" />
            </div>
          )}
          <p className="hidden items-start gap-2 text-muted-foreground sm:flex">
            <IconPin className="mt-0.5 shrink-0 text-promo" />
            <span className="line-clamp-2">
              <span className="font-semibold text-foreground">{order.destination.label}:</span> {order.destination.street}
            </span>
          </p>
        </div>
      </section>
    </div>
  );
}

export function TrackingCard(props: Props) {
  const { orderId } = props;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
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
  const live = active ? !active.stale : false;
  const markers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    if (destination) out.push({ id: "destination", kind: "destination", lat: destination.lat, lng: destination.lng });
    if (courier) out.push({ id: "courier", kind: "courier", lat: courier.lat, lng: courier.lng, live });
    return out;
  }, [destination?.lat, destination?.lng, courier?.lat, courier?.lng, live]);

  const full = params.get(FULL_PARAM) === "1";
  const openFull = () => {
    const next = new URLSearchParams(params);
    next.set(FULL_PARAM, "1");
    setParams(next, { state: { trackingOpened: true } });
  };
  // Opened from the card: step back in history. Landed on the URL directly: drop the param instead.
  const closeFull = useMemo(
    () => () => {
      if ((location.state as { trackingOpened?: boolean } | null)?.trackingOpened) {
        navigate(-1);
        return;
      }
      const next = new URLSearchParams(params);
      next.delete(FULL_PARAM);
      setParams(next, { replace: true });
    },
    [location.state, navigate, params, setParams],
  );

  if (!active) return null;
  const age = courier ? ageSec(courier.updated_at, now) : 0;
  const { title } = describe(active, age);

  return (
    <section className="card animate-rise overflow-hidden p-0 text-sm md:p-0">
      <div className="relative">
        <MapView markers={markers} route={ROUTE} routePath={active.route_path} ariaLabel="Peta lokasi kurir" className="isolate h-64 w-full sm:h-80" />
        <button type="button" onClick={openFull} className="material-chip map-chip-btn absolute right-3 top-3 z-10">
          <IconExpand />
          Layar penuh
        </button>
      </div>
      <div className="space-y-3 border-t border-border p-4">
        <div>
          <p className="t-label">Lacak kurir</p>
          <h2 className="t-title mt-0.5">{title}</h2>
        </div>
        <Figures t={active} />
        <Freshness t={active} age={age} />
      </div>

      {/* Portalled: the card's entry animation leaves a transform, which would trap a fixed child inside the card. */}
      {full && createPortal(<FullscreenTracking {...props} t={active} age={age} markers={markers} onClose={closeFull} />, document.body)}
    </section>
  );
}
