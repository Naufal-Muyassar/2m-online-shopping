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

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "text-lg font-bold" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
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
      <h1 className="text-2xl font-bold">Checkout</h1>
      <DemoBanner />
      {address && (
        <section className="card animate-rise text-sm">
          <div className="flex items-center justify-between">
            <p className="font-bold">{address.label}</p>
            <Link to={`/b/${branchId}/address`} className="inline-flex min-h-11 items-center px-2 font-medium text-accent">
              Ubah
            </Link>
          </div>
          <p>{address.street}</p>
          <p className="text-muted-foreground">
            {address.receiver_name} · {address.receiver_phone}
          </p>
        </section>
      )}

      <section className="card animate-rise space-y-2 text-sm" style={rise(1)}>
        <p className="font-bold">Metode pembayaran</p>
        {PAYMENT_METHODS.map((m) => (
          <label
            key={m}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-md border px-3",
              paymentMethod === m ? "border-primary bg-primary-surface font-bold text-primary-pressed" : "border-border bg-surface",
            )}
          >
            <input type="radio" name="pm" checked={paymentMethod === m} onChange={() => setPaymentMethod(m)} className="h-5 w-5 accent-primary" />
            {METHOD_LABEL[m]}
          </label>
        ))}
      </section>

      <section className="card animate-rise space-y-1 text-sm" style={rise(2)} aria-live="polite">
        {quote.isLoading && (
          <div className="space-y-2" aria-busy="true">
            <span className="sr-only">Menghitung harga…</span>
            <div className="skeleton h-4 w-2/3" />
            <div className="skeleton h-4 w-1/2" />
            <div className="skeleton h-6 w-full" />
          </div>
        )}
        {quote.isError && <p className="alert-box">{errorMessage(quote.error)}</p>}
        {b && (
          <>
            <Row label={`Subtotal (${b.total_weight_kg} kg)`} value={formatIDR(b.subtotal)} />
            <Row label={`Ongkir (±${b.route_distance_km} km)`} value={formatIDR(b.final_shipping_cost)} />
            <div className="space-y-0.5 pl-3 text-xs text-muted-foreground">
              <Row label="Tarif dasar" value={formatIDR(b.base_delivery_fee)} />
              {b.weight_surcharge > 0 && <Row label="Biaya berat" value={formatIDR(b.weight_surcharge)} />}
            </div>
            {b.voucher_discount > 0 && <Row label="Diskon voucher" value={`−${formatIDR(b.voucher_discount)}`} />}
            {b.payment_fee > 0 && <Row label="Biaya pembayaran" value={formatIDR(b.payment_fee)} />}
            <div className="card-footer">
              <Row label="Total" value={formatIDR(b.grand_total)} strong />
            </div>
          </>
        )}
      </section>

      <button onClick={place} disabled={!b || createOrder.isPending} className="btn-hero w-full">
        {createOrder.isPending ? "Memproses…" : "Bayar"}
      </button>
      <p className="text-center text-xs text-muted-foreground">Anda akan diarahkan ke halaman pembayaran.</p>
    </main>
  );
}
