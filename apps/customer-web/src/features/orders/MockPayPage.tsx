import type { ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { formatIDR, type MockInvoice } from "@2m/shared";
import { api, errorMessage } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { ErrorCard, PageSkeleton } from "../../components/States";
import { DemoBanner } from "../../components/DemoBanner";

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 justify-end">{children}</dd>
    </div>
  );
}

// Stand-in for the hosted payment page (API runs with PAYMENT_PROVIDER=mock and DEMO_MODE=true).
export function MockPayPage() {
  const { invoiceId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const invoice = useQuery({
    queryKey: ["mock-invoice", invoiceId],
    queryFn: async () => (await api.get<MockInvoice>(`/dev/mock-payments/${invoiceId}`)).data,
    retry: false,
  });

  const act = useMutation({
    mutationFn: async (action: "pay" | "expire") =>
      (await api.post<{ invoice: MockInvoice }>(`/dev/mock-payments/${invoiceId}/${action}`)).data.invoice,
    onSuccess: (inv) => {
      if (inv.order_id) navigate(`/orders/${inv.order_id}/return`, { replace: true });
      else void invoice.refetch();
    },
    onError: (e) => toast("error", errorMessage(e)),
  });

  if (invoice.isLoading) return <PageSkeleton />;
  if (invoice.isError || !invoice.data) {
    return (
      <main className="app-main">
        <ErrorCard message="Tagihan tidak ditemukan." />
      </main>
    );
  }

  const inv = invoice.data;
  const pending = inv.status === "PENDING";
  return (
    <main className="app-main">
      <h1 className="t-headline">Pembayaran simulasi</h1>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
        <section className="card animate-rise text-sm">
          <p className="t-label">Jumlah</p>
          <p className="t-figure mt-1">{formatIDR(inv.amount)}</p>
          <dl className="card-footer grid gap-x-8 gap-y-2 sm:grid-cols-2">
            <Row label="Metode">
              <span className="font-semibold">{inv.method}</span>
            </Row>
            <Row label="Status">
              <span className={`pill pill-dot ${pending ? "pill-warning" : "pill-info"}`}>{inv.status}</span>
            </Row>
            <Row label="No. tagihan">
              <span className="truncate font-semibold tabular-nums">{inv.external_id}</span>
            </Row>
            <Row label={inv.paid_at ? "Dibayar" : "Berlaku sampai"}>
              <span className="font-semibold tabular-nums">{fmtTime(inv.paid_at ?? inv.expires_at)}</span>
            </Row>
          </dl>
        </section>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-24">
          <DemoBanner />
          <p className="notice">Tidak ada uang yang dipindahkan.</p>
          {pending ? (
            <>
              <button onClick={() => act.mutate("pay")} disabled={act.isPending} className="btn btn-primary btn-lg btn-block">
                {act.isPending ? "Memproses…" : "Bayar (simulasi)"}
              </button>
              <button onClick={() => act.mutate("expire")} disabled={act.isPending} className="btn btn-secondary btn-block">
                Kedaluwarsakan
              </button>
            </>
          ) : (
            <button
              onClick={() => inv.order_id && navigate(`/orders/${inv.order_id}/return`, { replace: true })}
              disabled={!inv.order_id}
              className="btn btn-secondary btn-block"
            >
              Lihat pesanan
            </button>
          )}
        </aside>
      </div>
    </main>
  );
}
