import { Link, Navigate, useParams } from "react-router-dom";
import { formatIDR, PAYMENT_METHODS, type CalculatePriceRequest } from "@2m/shared";
import { errorMessage } from "../../lib/api";
import { DemoBanner } from "../../components/DemoBanner";
import { useCheckout } from "../../lib/checkout";
import { useAddresses, useCart, useCreateOrder, useQuote } from "../../lib/queries";
import { useToast } from "../../lib/toast";
import { cn } from "../../lib/utils";
import { rise } from "../../components/States";

const METHOD_LABEL: Record<string, string> = {
  QRIS: "QRIS",
  VA_BCA: "Virtual Account BCA",
  VA_BNI: "Virtual Account BNI",
  VA_BRI: "Virtual Account BRI",
  VA_MANDIRI: "Virtual Account Mandiri",
  EWALLET: "E-Wallet",
};

function Row({ label, value, quiet }: { label: string; value: string; quiet?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-3", quiet && "text-xs text-muted-foreground")}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export function CheckoutPage() {
  const { branchId = "" } = useParams();
  const toast = useToast();
  const { addressId, paymentMethod, setPaymentMethod } = useCheckout();
  const { data: addresses } = useAddresses();
  const { data: cart } = useCart(branchId);
  const createOrder = useCreateOrder(branchId);
  const address = addresses?.find((a) => a.id === addressId);

  const req: CalculatePriceRequest | null =
    address && cart && cart.items.length > 0
      ? { branch_id: branchId, address_id: address.id, payment_method: paymentMethod as CalculatePriceRequest["payment_method"] }
      : null;
  const quote = useQuote(req);

  if (addresses && !address) return <Navigate to={`/b/${branchId}/address`} replace />;

  function place() {
    if (!req) return;
    createOrder.mutate(req, {
      // Hosted payment page; the status page, not this redirect, decides whether the order is paid.
      onSuccess: (order) => window.location.assign(order.invoice_url),
      onError: (e) => toast("error", errorMessage(e)),
    });
  }

  const b = quote.data;
  return (
    <main className="app-main">
      <h1 className="t-headline">Checkout</h1>
      <DemoBanner />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
        <div className="flex min-w-0 flex-col gap-5">
          {address && (
            <section className="card animate-rise text-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="t-title">{address.label}</p>
                <Link to={`/b/${branchId}/address`} className="link -my-2 text-sm">
                  Ubah
                </Link>
              </div>
              <p className="mt-2">{address.street}</p>
              <p className="mt-1 text-muted-foreground">
                {address.receiver_name} · {address.receiver_phone}
              </p>
            </section>
          )}

          <section className="animate-rise space-y-3 text-sm" style={rise(1)}>
            <div className="section-head">
              <p className="t-title">Metode pembayaran</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {PAYMENT_METHODS.map((m) => (
                <label key={m} className="option-row" data-selected={paymentMethod === m}>
                  <input type="radio" name="pm" checked={paymentMethod === m} onChange={() => setPaymentMethod(m)} className="size-5 shrink-0 accent-primary" />
                  {METHOD_LABEL[m]}
                </label>
              ))}
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-24">
          <section className="card animate-rise space-y-2 text-sm" style={rise(2)} aria-live="polite">
            {quote.isLoading && (
              <div className="space-y-2" aria-busy="true">
                <span className="sr-only">Menghitung harga…</span>
                <div className="skeleton h-4 w-2/3" />
                <div className="skeleton h-4 w-1/2" />
                <div className="skeleton h-8 w-full" />
              </div>
            )}
            {quote.isError && <p className="alert-box">{errorMessage(quote.error)}</p>}
            {b && (
              <>
                <Row label={`Subtotal (${b.total_weight_kg} kg)`} value={formatIDR(b.subtotal)} />
                <Row label={`Ongkir (±${b.route_distance_km} km)`} value={formatIDR(b.final_shipping_cost)} />
                <div className="space-y-1 border-l border-border pl-3">
                  <Row label="Tarif dasar" value={formatIDR(b.base_delivery_fee)} quiet />
                  {b.weight_surcharge > 0 && <Row label="Biaya berat" value={formatIDR(b.weight_surcharge)} quiet />}
                </div>
                {b.voucher_discount > 0 && <Row label="Diskon voucher" value={`−${formatIDR(b.voucher_discount)}`} />}
                {b.payment_fee > 0 && <Row label="Biaya pembayaran" value={formatIDR(b.payment_fee)} />}
                <div className="card-footer flex items-baseline justify-between gap-3">
                  <span className="t-title">Total</span>
                  <span className="t-figure">{formatIDR(b.grand_total)}</span>
                </div>
              </>
            )}
          </section>

          <button onClick={place} disabled={!b || createOrder.isPending} className="btn btn-primary btn-lg btn-block">
            {createOrder.isPending ? "Memproses…" : "Bayar"}
          </button>
          <p className="t-label text-center">Anda akan diarahkan ke halaman pembayaran.</p>
        </aside>
      </div>
    </main>
  );
}
