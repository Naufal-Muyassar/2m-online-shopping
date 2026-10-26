import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { formatIDR, type MockInvoice } from "@2m/shared";
import { api, errorMessage } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { cn } from "../../lib/utils";
import { btnSecondary, ErrorCard, PageSkeleton } from "../../components/States";
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
      <h1 className="text-2xl font-bold">Pembayaran simulasi</h1>
      <DemoBanner />
      <p className="notice">Tidak ada uang yang dipindahkan.</p>
      <section className="card animate-rise space-y-2 text-sm">
        <div className="flex justify-between">
          <span>Jumlah</span>
          <span className="text-base font-bold">{formatIDR(inv.amount)}</span>
        </div>
        <div className="flex justify-between">
          <span>Metode</span>
          <span>{inv.method}</span>
        </div>
        <div className="flex justify-between">
          <span>Status</span>
          <span className={`pill ${pending ? "pill-warning" : "pill-info"}`}>{inv.status}</span>
        </div>
      </section>
      {pending ? (
        <div className="space-y-2">
          <button onClick={() => act.mutate("pay")} disabled={act.isPending} className="btn-hero w-full">
            {act.isPending ? "Memproses…" : "Bayar (simulasi)"}
          </button>
          <button onClick={() => act.mutate("expire")} disabled={act.isPending} className={cn(btnSecondary, "w-full")}>
            Kedaluwarsakan
          </button>
        </div>
      ) : (
        <button
          onClick={() => inv.order_id && navigate(`/orders/${inv.order_id}/return`, { replace: true })}
          disabled={!inv.order_id}
          className={cn(btnSecondary, "w-full")}
        >
          Lihat pesanan
        </button>
      )}
    </main>
  );
}
