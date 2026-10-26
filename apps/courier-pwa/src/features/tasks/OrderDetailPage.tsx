import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { CourierOrder } from "@2m/shared";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api";
import { getFreshFix } from "@/platform/geo";
import { ProofFlow } from "@/features/proof/ProofFlow";
import { useSecondsSinceLastPing } from "@/tracking";
import { useOrder, useOrderStatus, usePickItem, useReleaseOrder } from "./hooks";
import { STATUS_LABELS, STATUS_PILLS } from "./OrderCard";
import { LoadingBlock } from "@/components/ui/feedback";
import { FaArrowLeft, FaCheck, FaExclamationTriangle, FaMapMarkerAlt, FaPhone, FaTruck } from "react-icons/fa";

type Panel = "none" | "deliver" | "fail";

const STEPS = [
  { status: "PICKING", label: "Siapkan barang" },
  { status: "ON_DELIVERY", label: "Antar" },
] as const;

function Stepper({ status }: { status: string }) {
  const current = STEPS.findIndex((s) => s.status === status);
  return (
    <ol className="flex gap-2" aria-label="Tahap pesanan">
      {STEPS.map((s, i) => (
        <li
          key={s.status}
          className={`flex-1 rounded-full px-3 py-2 text-center text-sm font-bold transition-colors ${
            i === current
              ? "bg-primary text-primary-foreground shadow-glow"
              : i < current
                ? "bg-success-surface text-success"
                : "bg-muted text-muted-foreground"
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
        <h2 className="font-bold">Barang</h2>
        <span className={`pill ${ready === order.items.length ? "pill-success" : "pill-warning"}`}>
          {ready} dari {order.items.length} item siap
        </span>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {order.items.map((it) => {
          const done = it.picked_qty >= it.qty;
          return (
            <li key={it.id} className={`rounded-md border p-2 transition-colors ${done ? "border-success bg-success-surface" : "border-border bg-surface"}`}>
              <button
                type="button"
                className="flex min-h-12 w-full items-center justify-between gap-2 text-left active:scale-[0.99]"
                disabled={pick.isPending}
                onClick={() => set(it.id, it.qty)}
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden className={done ? "font-bold text-success" : "text-muted-foreground"}>
                    {done ? "✓" : "○"}
                  </span>
                  <span>{it.name}</span>
                </span>
                <span className="font-bold">
                  {it.picked_qty}/{it.qty}
                </span>
              </button>
              <div className="mt-1 flex items-center justify-end gap-3">
                <button
                  type="button"
                  aria-label={`Kurangi ${it.name}`}
                  className="icon-btn size-12 border border-border bg-surface text-2xl disabled:opacity-60"
                  disabled={pick.isPending || it.picked_qty <= 0}
                  onClick={() => set(it.id, it.picked_qty - 1)}
                >
                  −
                </button>
                <button
                  type="button"
                  aria-label={`Tambah ${it.name}`}
                  className="icon-btn size-12 bg-primary-surface text-2xl text-primary-pressed disabled:opacity-60"
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
    <div role="dialog" aria-modal="true" aria-label="Lepas order" className="sheet-backdrop z-50">
      <div className="sheet-panel">
        <span aria-hidden="true" className="sheet-grabber" />
        <h2 className="text-xl font-bold">Lepas order?</h2>
        <p className="text-muted-foreground">Order kembali ke daftar job dan bisa diambil kurir lain.</p>
        <label className="flex flex-col gap-1 text-sm font-medium text-muted-foreground">
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

function LocationNotice() {
  const sec = useSecondsSinceLastPing();
  return (
    <div role="status" className="notice flex items-start gap-3">
      <FaMapMarkerAlt aria-hidden="true" className="mt-1 shrink-0" />
      <div>
        <p>Jaga layar tetap menyala agar lokasi terkirim</p>
        {sec !== null && <p className="font-bold">Lokasi terakhir terkirim {sec} detik lalu</p>}
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
        <Link to="/" className="inline-flex min-h-11 items-center font-semibold text-accent underline">
          <FaArrowLeft aria-hidden="true" className="mr-2 inline" />
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
        <Link to="/" aria-label="Kembali" className="icon-btn shrink-0">
          <FaArrowLeft aria-hidden="true" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold">{order.code}</h1>
        <span className={`pill pill-dot ${STATUS_PILLS[order.status] ?? ""}`}>{STATUS_LABELS[order.status] ?? order.status}</span>
      </header>

      <main className="app-main pb-8">
        {(order.status === "PICKING" || order.status === "ON_DELIVERY") && <Stepper status={order.status} />}

        {returning && <p className="alert-box font-medium">Kembalikan barang ke cabang – menunggu konfirmasi admin</p>}

        {order.status === "PICKING" && <PickingChecklist order={order} />}

        <section className="card animate-rise" style={{ animationDelay: "70ms" }}>
          <h2 className="eyebrow">Penerima</h2>
          <p className="mt-1 text-lg font-bold">{a.receiver_name}</p>
          <a
            href={`tel:${a.receiver_phone}`}
            className="mt-1 flex min-h-11 items-center text-lg font-semibold text-accent underline transition-colors hover:text-primary-pressed"
          >
            <FaPhone aria-hidden="true" className="mr-2" />
            {a.receiver_phone}
          </a>
          <p className="mt-2 [overflow-wrap:anywhere]">
            {a.street}
            {a.rt_rw ? `, RT/RW ${a.rt_rw}` : ""}
            {a.unit ? `, ${a.unit}` : ""}
          </p>
          {a.courier_note && <p className="note-rail mt-3 text-sm">Catatan: {a.courier_note}</p>}
          <a
            href={maps}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex min-h-14 items-center justify-center rounded-md bg-accent text-lg font-bold text-accent-foreground transition active:scale-[0.97]"
          >
            <FaMapMarkerAlt aria-hidden="true" className="mr-2" />
            Buka di Google Maps
          </a>
        </section>

        {order.status === "ON_DELIVERY" && <LocationNotice />}

        {order.status !== "PICKING" && (
          <section className="card animate-rise" style={{ animationDelay: "140ms" }}>
            <h2 className="eyebrow">Barang</h2>
            <ul className="mt-1 divide-y divide-border">
              {order.items.map((it) => (
                <li key={it.id} className="flex justify-between gap-3 py-2">
                  <span>{it.name}</span>
                  <span className="font-bold">×{it.qty}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {order.status === "PICKING" && (
          <>
            <Button variant="hero" loading={statusMutation.isPending} onClick={() => void start()}>
              <FaTruck aria-hidden="true" className="mr-2 inline" />
              Mulai antar
            </Button>
            {!allPicked && <p className="text-center text-sm text-muted-foreground">Siapkan semua barang dulu untuk berangkat.</p>}
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
            <Button variant="hero" onClick={() => setPanel("deliver")}>
              <FaCheck aria-hidden="true" className="mr-2 inline" />
              Selesai
            </Button>
            <Button variant="destructive" onClick={() => setPanel("fail")}>
              <FaExclamationTriangle aria-hidden="true" className="mr-2 inline" />
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
