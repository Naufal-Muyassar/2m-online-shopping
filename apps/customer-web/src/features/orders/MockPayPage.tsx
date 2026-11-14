import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { formatIDR, type MockInvoice } from "@2m/shared";
import { api, errorMessage } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { ErrorCard, PageSkeleton } from "../../components/States";
import { DemoBanner } from "../../components/DemoBanner";

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
      <div className="page-narrow flex flex-col gap-4">
        <DemoBanner />
        <p className="notice">Tidak ada uang yang dipindahkan.</p>
        <section className="card animate-rise text-sm">
          <p className="t-label">Jumlah</p>
          <p className="t-figure mt-1">{formatIDR(inv.amount)}</p>
          <dl className="card-footer space-y-2">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Metode</dt>
              <dd className="font-semibold">{inv.method}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <span className={`pill pill-dot ${pending ? "pill-warning" : "pill-info"}`}>{inv.status}</span>
              </dd>
            </div>
          </dl>
        </section>
        {pending ? (
          <div className="flex flex-col gap-2">
            <button onClick={() => act.mutate("pay")} disabled={act.isPending} className="btn btn-primary btn-lg btn-block">
              {act.isPending ? "Memproses…" : "Bayar (simulasi)"}
            </button>
            <button onClick={() => act.mutate("expire")} disabled={act.isPending} className="btn btn-secondary btn-block">
              Kedaluwarsakan
            </button>
          </div>
        ) : (
          <button
            onClick={() => inv.order_id && navigate(`/orders/${inv.order_id}/return`, { replace: true })}
            disabled={!inv.order_id}
            className="btn btn-secondary btn-block"
          >
            Lihat pesanan
          </button>
        )}
      </div>
    </main>
  );
}
