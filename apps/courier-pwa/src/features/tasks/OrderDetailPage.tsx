import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api";
import { getFreshFix } from "@/platform/geo";
import { ProofFlow } from "@/features/proof/ProofFlow";
import { useOrder, useOrderStatus } from "./hooks";
import { STATUS_LABELS } from "./OrderCard";

type Panel = "none" | "deliver" | "fail";

export function OrderDetailPage() {
  const { id = "" } = useParams();
  const { notify } = useToast();
  const navigate = useNavigate();
  const query = useOrder(id);
  const statusMutation = useOrderStatus();
  const [panel, setPanel] = useState<Panel>("none");
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
        <p role="alert" className="text-destructive">
          {errorMessage(query.error)}
        </p>
        <Link to="/" className="mt-4 inline-block underline">
          Kembali
        </Link>
      </main>
    );
  }

  const a = order.address;
  const maps = `https://www.google.com/maps/dir/?api=1&destination=${a.lat},${a.lng}`;
  const returning = order.status === "FAILED" && order.return_pending;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-4">
      <Link to="/" className="min-h-12 text-base underline">
        ← Kembali
      </Link>
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{order.code}</h1>
        <span className="rounded-full bg-secondary px-3 py-1 text-sm font-medium">
          {STATUS_LABELS[order.status] ?? order.status}
        </span>
      </header>

      {returning && (
        <p className="rounded-lg bg-destructive/10 p-3 font-medium text-destructive">
          Kembalikan barang ke cabang – menunggu konfirmasi admin
        </p>
      )}

      <section className="rounded-xl border border-border p-4">
        <h2 className="font-bold">Penerima</h2>
        <p className="text-lg">{a.receiver_name}</p>
        <a href={`tel:${a.receiver_phone}`} className="mt-1 flex min-h-12 items-center text-lg font-semibold text-primary underline">
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
          Buka di Google Maps
        </a>
      </section>

      <section className="rounded-xl border border-border p-4">
        <h2 className="font-bold">Barang</h2>
        <ul className="mt-1 divide-y divide-border">
          {order.items.map((it) => (
            <li key={it.sku} className="flex justify-between py-2">
              <span>{it.name}</span>
              <span className="font-semibold">×{it.qty}</span>
            </li>
          ))}
        </ul>
      </section>

      {order.status === "ASSIGNED" && (
        <>
          <Button loading={statusMutation.isPending} onClick={() => void start()}>
            Mulai antar
          </Button>
          {startError && (
            <p role="alert" className="text-destructive">
              {startError}
            </p>
          )}
        </>
      )}

      {order.status === "ON_DELIVERY" && panel === "none" && (
        <>
          <Button onClick={() => setPanel("deliver")}>Selesai</Button>
          <Button variant="destructive" onClick={() => setPanel("fail")}>
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
