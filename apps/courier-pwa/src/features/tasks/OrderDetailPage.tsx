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
import { STATUS_LABELS } from "./OrderCard";
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
          className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-semibold ${
            i === current ? "bg-primary text-primary-foreground" : i < current ? "bg-secondary" : "bg-muted text-muted-foreground"
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
    <section className="rounded-xl border border-border p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Barang</h2>
        <span className="text-sm font-medium">
          {ready} dari {order.items.length} item siap
        </span>
      </div>
      <ul className="mt-2 flex flex-col gap-2">
        {order.items.map((it) => {
          const done = it.picked_qty >= it.qty;
          return (
            <li key={it.id} className={`rounded-lg border p-2 ${done ? "border-primary bg-primary/5" : "border-border"}`}>
              <button
                type="button"
                className="flex min-h-12 w-full items-center justify-between gap-2 text-left"
                disabled={pick.isPending}
                onClick={() => set(it.id, it.qty)}
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden>{done ? "✓" : "○"}</span>
                  <span>{it.name}</span>
                </span>
                <span className="font-semibold">
                  {it.picked_qty}/{it.qty}
                </span>
              </button>
              <div className="mt-1 flex items-center justify-end gap-3">
                <button
                  type="button"
                  aria-label={`Kurangi ${it.name}`}
                  className="min-h-12 min-w-12 rounded-lg border border-border text-xl"
                  disabled={pick.isPending || it.picked_qty <= 0}
                  onClick={() => set(it.id, it.picked_qty - 1)}
                >
                  −
                </button>
                <button
                  type="button"
                  aria-label={`Tambah ${it.name}`}
                  className="min-h-12 min-w-12 rounded-lg border border-border text-xl"
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
    <div role="dialog" aria-modal="true" aria-label="Lepas order" className="fixed inset-0 z-50 flex items-end bg-black/50 p-4">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 rounded-xl bg-background p-4">
        <h2 className="text-xl font-bold">Lepas order?</h2>
        <p className="text-muted-foreground">Order kembali ke daftar job dan bisa diambil kurir lain.</p>
        <label className="flex flex-col gap-1 font-medium">
          Alasan
          <textarea
            className="min-h-24 rounded-lg border border-input bg-background p-3 text-lg"
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={release.isPending}
          />
        </label>
        {release.isError && (
          <p role="alert" className="text-destructive">
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
    <div className="rounded-lg bg-muted p-3 text-sm">
      <p>Jaga layar tetap menyala agar lokasi terkirim</p>
      {sec !== null && <p className="font-medium">Lokasi terakhir terkirim {sec} detik lalu</p>}
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

  if (query.isLoading) return <main className="p-4 text-muted-foreground">Memuat…</main>;
  if (query.isError || !order) {
    return (
      <main className="mx-auto max-w-md p-4">
        <p role="alert" className="text-foreground">
          {errorMessage(query.error)}
        </p>
        <Link to="/" className="mt-4 inline-block underline">
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
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-4">
      <Link to="/" className="min-h-12 text-base underline">
        <FaArrowLeft aria-hidden="true" className="mr-2 inline" />
        Kembali
      </Link>
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{order.code}</h1>
        <span className="rounded-full bg-secondary px-3 py-1 text-sm font-medium">
          {STATUS_LABELS[order.status] ?? order.status}
        </span>
      </header>

      {(order.status === "PICKING" || order.status === "ON_DELIVERY") && <Stepper status={order.status} />}

      {returning && (
        <p className="rounded-lg bg-destructive/10 p-3 font-medium text-foreground">
          Kembalikan barang ke cabang – menunggu konfirmasi admin
        </p>
      )}

      {order.status === "PICKING" && <PickingChecklist order={order} />}

      <section className="rounded-xl border border-border p-4">
        <h2 className="font-bold">Penerima</h2>
        <p className="text-lg">{a.receiver_name}</p>
          <a href={`tel:${a.receiver_phone}`} className="mt-1 flex min-h-12 items-center text-lg font-semibold text-primary underline transition-colors hover:text-destructive">
          <FaPhone aria-hidden="true" className="mr-2" />
          {a.receiver_phone}
        </a>
        <p className="mt-2">
          {a.street}
          {a.rt_rw ? `, RT/RW ${a.rt_rw}` : ""}
          {a.unit ? `, ${a.unit}` : ""}
        </p>
        {a.courier_note && <p className="mt-2 rounded-lg bg-muted p-2 text-sm">Catatan: {a.courier_note}</p>}
        <a
          href={maps}
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex min-h-14 items-center justify-center rounded-lg border border-border text-lg font-semibold"
        >
          <FaMapMarkerAlt aria-hidden="true" className="mr-2" />
          Buka di Google Maps
        </a>
      </section>

      {order.status === "ON_DELIVERY" && <LocationNotice />}

      {order.status !== "PICKING" && (
        <section className="rounded-xl border border-border p-4">
          <h2 className="font-bold">Barang</h2>
          <ul className="mt-1 divide-y divide-border">
            {order.items.map((it) => (
              <li key={it.id} className="flex justify-between py-2">
                <span>{it.name}</span>
                <span className="font-semibold">×{it.qty}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {order.status === "PICKING" && (
        <>
          <Button loading={statusMutation.isPending} onClick={() => void start()}>
            <FaTruck aria-hidden="true" className="mr-2 inline" />
            Mulai antar
          </Button>
          {!allPicked && <p className="text-center text-sm text-muted-foreground">Siapkan semua barang dulu untuk berangkat.</p>}
          {startError && (
            <p role="alert" className="text-foreground">
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
  );
}
