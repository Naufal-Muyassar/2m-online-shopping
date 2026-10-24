import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { formatIDR, type MockInvoice } from "@2m/shared";
import { api, errorMessage } from "../../lib/api";
import { useToast } from "../../lib/toast";

// Dev/demo stand-in for the hosted payment page (API runs with PAYMENT_PROVIDER=mock).
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

  if (invoice.isLoading) return <p className="p-4 text-sm text-muted-foreground">Memuat…</p>;
  if (invoice.isError || !invoice.data) return <p className="p-4 text-sm text-destructive">Tagihan tidak ditemukan.</p>;

  const inv = invoice.data;
  const pending = inv.status === "PENDING";
  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="text-xl font-semibold">Pembayaran simulasi</h1>
      <p className="rounded-md bg-secondary p-2 text-xs text-muted-foreground">
        Halaman ini hanya untuk demo/pengembangan. Tidak ada uang yang dipindahkan.
      </p>
      <section className="space-y-1 rounded-lg border p-4 text-sm">
        <div className="flex justify-between">
          <span>Jumlah</span>
          <span className="font-semibold">{formatIDR(inv.amount)}</span>
        </div>
        <div className="flex justify-between">
          <span>Metode</span>
          <span>{inv.method}</span>
        </div>
        <div className="flex justify-between">
          <span>Status</span>
          <span>{inv.status}</span>
        </div>
      </section>
      {pending ? (
        <div className="space-y-2">
          <button
            onClick={() => act.mutate("pay")}
            disabled={act.isPending}
            className="w-full rounded-md bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
          >
            {act.isPending ? "Memproses…" : "Bayar (simulasi)"}
          </button>
          <button
            onClick={() => act.mutate("expire")}
            disabled={act.isPending}
            className="w-full rounded-md border px-3 py-2 disabled:opacity-50"
          >
            Kedaluwarsakan
          </button>
        </div>
      ) : (
        <button
          onClick={() => inv.order_id && navigate(`/orders/${inv.order_id}/return`, { replace: true })}
          disabled={!inv.order_id}
          className="w-full rounded-md border px-3 py-2 disabled:opacity-50"
        >
          Lihat pesanan
        </button>
      )}
    </main>
  );
}
