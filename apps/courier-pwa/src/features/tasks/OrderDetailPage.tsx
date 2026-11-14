import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { CourierOrder } from "@2m/shared";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api";
import { getFreshFix } from "@/platform/geo";
import { ProofFlow } from "@/features/proof/ProofFlow";
import { useMyPosition, useSecondsSinceLastPing } from "@/tracking";
import { MapView, type MapMarker } from "@2m/map";
import { useOrder, useOrderStatus, usePickItem, useReleaseOrder } from "./hooks";
import { STATUS_LABELS, STATUS_PILLS } from "./OrderCard";
import { LoadingBlock } from "@/components/ui/feedback";
import { useChatThreads, useOpenChat } from "@/features/chat/hooks";
import { FaArrowLeft, FaCheck, FaCommentDots, FaExclamationTriangle, FaMapMarkerAlt, FaPhone, FaTruck } from "react-icons/fa";

type Panel = "none" | "deliver" | "fail";

const STEPS = [
  { status: "PICKING", label: "Siapkan barang" },
  { status: "ON_DELIVERY", label: "Antar" },
] as const;

function Stepper({ status }: { status: string }) {
  const current = STEPS.findIndex((s) => s.status === status);
  return (
    <ol className="grid grid-cols-2 gap-3" aria-label="Tahap pesanan">
      {STEPS.map((s, i) => (
        <li
          key={s.status}
          aria-current={i === current ? "step" : undefined}
          className={`border-t-2 pt-2 text-sm transition-colors duration-300 ${
            i === current
              ? "border-foreground font-extrabold"
              : i < current
                ? "border-success font-semibold text-success"
                : "border-border font-semibold text-muted-foreground"
          }`}
        >
          {i + 1}. {s.label}
        </li>
      ))}
    </ol>
  );
}

function PickingChecklist({ order }: { order: CourierOrder }) {
  const { notify } = useToast();
  const pick = usePickItem(order.id);
  const ready = order.items.filter((i) => i.picked_qty >= i.qty).length;

  const set = (itemId: string, pickedQty: number) =>
    pick.mutate({ itemId, pickedQty }, { onError: (err) => notify("error", errorMessage(err)) });

  return (
    <section className="card animate-rise">
      <div className="flex items-center justify-between gap-2">
        <h2 className="t-title">Barang</h2>
        <span className={`pill tabular-nums ${ready === order.items.length ? "pill-success" : "pill-warning"}`}>
          {ready} dari {order.items.length} item siap
        </span>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {order.items.map((it) => {
          const done = it.picked_qty >= it.qty;
          return (
            <li key={it.id} className={`rounded-md border p-2.5 transition-colors duration-200 ${done ? "border-success bg-success-surface" : "border-border bg-surface"}`}>
              <button
                type="button"
                className="flex min-h-12 w-full items-center justify-between gap-2 text-left transition-transform duration-100 active:scale-[0.99]"
                disabled={pick.isPending}
                onClick={() => set(it.id, it.qty)}
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden className={done ? "font-bold text-success" : "text-muted-foreground"}>
                    {done ? "✓" : "○"}
                  </span>
                  <span className="font-medium">{it.name}</span>
                </span>
                <span className="font-extrabold tabular-nums">
                  {it.picked_qty}/{it.qty}
                </span>
              </button>
              <div className="mt-1 flex items-center justify-end gap-3">
                <button
                  type="button"
                  aria-label={`Kurangi ${it.name}`}
                  className="icon-btn size-12 text-2xl"
                  disabled={pick.isPending || it.picked_qty <= 0}
                  onClick={() => set(it.id, it.picked_qty - 1)}
                >
                  −
                </button>
                <button
                  type="button"
                  aria-label={`Tambah ${it.name}`}
                  className="icon-btn size-12 border-foreground text-2xl"
                  disabled={pick.isPending || it.picked_qty >= it.qty}
                  onClick={() => set(it.id, it.picked_qty + 1)}
                >
                  +
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ReleaseDialog({ orderId, onClose, onReleased }: { orderId: string; onClose: () => void; onReleased: () => void }) {
  const { notify } = useToast();
  const release = useReleaseOrder(orderId);
  const [reason, setReason] = useState("");

  const submit = () =>
    release.mutate(reason.trim(), {
      onSuccess: () => {
        notify("success", "Order dilepas.");
        onReleased();
      },
      onError: (err) => notify("error", errorMessage(err)),
    });

  return (
    <div role="dialog" aria-modal="true" aria-label="Lepas order" className="sheet-backdrop">
      <div className="sheet-panel">
        <span aria-hidden="true" className="sheet-grabber" />
        <h2 className="t-headline">Lepas order?</h2>
        <p className="text-muted-foreground">Order kembali ke daftar job dan bisa diambil kurir lain.</p>
        <label className="field-label flex flex-col gap-1.5">
          Alasan
          <textarea
            className="field min-h-24 text-lg"
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={release.isPending}
          />
        </label>
        {release.isError && (
          <p role="alert" className="alert-box">
            {errorMessage(release.error)}
          </p>
        )}
        <Button variant="destructive" loading={release.isPending} disabled={reason.trim() === ""} onClick={submit}>
          Ya, lepas order
        </Button>
        <Button variant="secondary" disabled={release.isPending} onClick={onClose}>
          Batal
        </Button>
      </div>
    </div>
  );
}

function CustomerChatButton({ orderId }: { orderId: string }) {
  const navigate = useNavigate();
  const { notify } = useToast();
  const open = useOpenChat();
  const unread =
    useChatThreads().data?.find((t) => t.channel === "customer_courier" && t.order_id === orderId)?.unread_count ?? 0;

  return (
    <button
      type="button"
      disabled={open.isPending}
      onClick={() =>
        open.mutate(
          { channel: "customer_courier", order_id: orderId },
          { onSuccess: (t) => navigate(`/chat/${t.id}`), onError: (err) => notify("error", errorMessage(err)) },
        )
      }
      aria-label={unread > 0 ? `Chat pelanggan, ${unread} pesan belum dibaca` : "Chat pelanggan"}
      className="btn btn-secondary btn-lg btn-block"
    >
      <FaCommentDots aria-hidden="true" />
      Chat
      {unread > 0 && <span className="count-badge static">{unread}</span>}
    </button>
  );
}

const ROUTE = ["courier", "destination"];

function DeliveryMap({ order }: { order: CourierOrder }) {
  const { lat, lng, receiver_name: receiver } = order.address;
  const me = useMyPosition();
  const markers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [{ id: "destination", kind: "destination", lat, lng, label: receiver }];
    if (me) out.push({ id: "courier", kind: "courier", lat: me.lat, lng: me.lng, label: "Anda", live: true });
    return out;
  }, [lat, lng, receiver, me?.lat, me?.lng]);

  return (
    <section className="animate-rise" aria-label="Peta pengantaran">
      <MapView
        markers={markers}
        route={ROUTE}
        ariaLabel="Peta lokasi Anda dan tujuan"
        className="isolate h-64 w-full overflow-hidden rounded-lg border border-border sm:h-72"
      />
      {!me && <p className="t-label mt-2">Menunggu lokasi Anda. Pastikan izin lokasi aktif.</p>}
    </section>
  );
}

function LocationNotice() {
  const sec = useSecondsSinceLastPing();
  return (
    <div role="status" className="notice flex items-start gap-3">
      <FaMapMarkerAlt aria-hidden="true" className="mt-1 shrink-0" />
      <div>
        <p>Jaga layar tetap menyala agar lokasi terkirim</p>
        {sec !== null && <p className="font-extrabold tabular-nums">Lokasi terakhir terkirim {sec} detik lalu</p>}
      </div>
    </div>
  );
}

export function OrderDetailPage() {
  const { id = "" } = useParams();
  const { notify } = useToast();
  const navigate = useNavigate();
  const query = useOrder(id);
  const statusMutation = useOrderStatus();
  const [panel, setPanel] = useState<Panel>("none");
  const [releasing, setReleasing] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [startKey, setStartKey] = useState(() => crypto.randomUUID());

  const order = query.data;

  const start = async () => {
    if (!order) return;
    setStartError(null);
    try {
      const fix = await getFreshFix();
      await statusMutation.mutateAsync({
        orderId: order.id,
        body: {
          to: "ON_DELIVERY",
          lat: fix.lat,
          lng: fix.lng,
          accuracy: fix.accuracy,
          client_ts: new Date().toISOString(),
          idempotency_key: startKey,
        },
      });
      setStartKey(crypto.randomUUID());
      notify("success", "Pengantaran dimulai.");
    } catch (err) {
      const msg = errorMessage(err);
      setStartError(msg);
      notify("error", msg);
    }
  };

  if (query.isLoading) {
    return (
      <main className="app-main">
        <LoadingBlock rows={3} />
      </main>
    );
  }
  if (query.isError || !order) {
    return (
      <main className="app-main">
        <p role="alert" className="alert-box">
          {errorMessage(query.error)}
        </p>
        <Link to="/" className="link self-start">
          <FaArrowLeft aria-hidden="true" />
          Kembali
        </Link>
      </main>
    );
  }

  const a = order.address;
  const maps = `https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}`;
  const returning = order.status === "FAILED" && order.return_pending;
  const allPicked = order.items.every((i) => i.picked_qty >= i.qty);

  return (
    <>
      <header className="app-header">
        <Link to="/" aria-label="Kembali" className="icon-btn">
          <FaArrowLeft aria-hidden="true" />
        </Link>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h1 className="text-lg font-extrabold tabular-nums tracking-tight">{order.code}</h1>
          <span className={`pill pill-dot ${STATUS_PILLS[order.status] ?? ""}`}>{STATUS_LABELS[order.status] ?? order.status}</span>
        </div>
      </header>

      <main className="app-main pb-8">
        {(order.status === "PICKING" || order.status === "ON_DELIVERY") && <Stepper status={order.status} />}

        {returning && <p className="alert-box">Kembalikan barang ke cabang – menunggu konfirmasi admin</p>}

        {(order.status === "PICKING" || order.status === "ON_DELIVERY") && <DeliveryMap order={order} />}

        {order.status === "PICKING" && <PickingChecklist order={order} />}

        <section className="card animate-rise" style={{ animationDelay: "60ms" }}>
          <h2 className="t-label">Penerima</h2>
          <p className="t-headline mt-1">{a.receiver_name}</p>
          <p className="mt-1 flex items-center gap-2 text-lg font-semibold tabular-nums">
            <FaPhone aria-hidden="true" className="text-sm text-muted-foreground" />
            {a.receiver_phone}
          </p>
          <p className="mt-2 border-t border-border pt-3 [overflow-wrap:anywhere]">
            {a.street}
            {a.rt_rw ? `, RT/RW ${a.rt_rw}` : ""}
            {a.unit ? `, ${a.unit}` : ""}
          </p>
          {a.courier_note && <p className="note-rail mt-3 text-sm">Catatan: {a.courier_note}</p>}
          <div className="mt-4 flex flex-col gap-2">
            <a href={maps} target="_blank" rel="noreferrer" className="btn btn-secondary btn-lg btn-block border-foreground">
              <FaMapMarkerAlt aria-hidden="true" />
              Buka di Google Maps
            </a>
            {/* Calling and chatting sit side by side: the two ways to reach the receiver. */}
            <div className="grid grid-cols-2 gap-2">
              <a href={`tel:${a.receiver_phone}`} aria-label={`Telepon ${a.receiver_name}`} className="btn btn-secondary btn-lg btn-block">
                <FaPhone aria-hidden="true" />
                Telepon
              </a>
              <CustomerChatButton orderId={order.id} />
            </div>
          </div>
        </section>

        {order.status === "ON_DELIVERY" && <LocationNotice />}

        {order.status !== "PICKING" && (
          <section className="card animate-rise" style={{ animationDelay: "120ms" }}>
            <h2 className="t-label">Barang</h2>
            <ul className="mt-1 divide-y divide-border">
              {order.items.map((it) => (
                <li key={it.id} className="flex justify-between gap-3 py-2.5">
                  <span className="font-medium">{it.name}</span>
                  <span className="font-extrabold tabular-nums">×{it.qty}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {order.status === "PICKING" && (
          <>
            <Button loading={statusMutation.isPending} onClick={() => void start()}>
              <FaTruck aria-hidden="true" />
              Mulai antar
            </Button>
            {!allPicked && <p className="t-label text-center">Siapkan semua barang dulu untuk berangkat.</p>}
            {startError && (
              <p role="alert" className="alert-box">
                {startError}
              </p>
            )}
            <Button variant="secondary" disabled={statusMutation.isPending} onClick={() => setReleasing(true)}>
              Lepas order
            </Button>
            {releasing && (
              <ReleaseDialog orderId={order.id} onClose={() => setReleasing(false)} onReleased={() => navigate("/")} />
            )}
          </>
        )}

        {order.status === "ON_DELIVERY" && panel === "none" && (
          <>
            <Button onClick={() => setPanel("deliver")}>
              <FaCheck aria-hidden="true" />
              Selesai
            </Button>
            <Button variant="destructive" onClick={() => setPanel("fail")}>
              <FaExclamationTriangle aria-hidden="true" />
              Gagal kirim
            </Button>
          </>
        )}

        {order.status === "ON_DELIVERY" && panel !== "none" && (
          <ProofFlow
            orderId={order.id}
            mode={panel === "deliver" ? "DELIVERED" : "FAILED"}
            onCancel={() => setPanel("none")}
            onDone={() => {
              const delivered = panel === "deliver";
              setPanel("none");
              if (delivered) navigate("/");
            }}
          />
        )}
      </main>
    </>
  );
}
