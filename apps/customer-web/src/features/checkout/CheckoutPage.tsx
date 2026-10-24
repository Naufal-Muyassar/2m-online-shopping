import { Link, Navigate, useParams } from "react-router-dom";
import { formatIDR, PAYMENT_METHODS, type CalculatePriceRequest } from "@2m/shared";
import { errorMessage } from "../../lib/api";
import { useCheckout } from "../../lib/checkout";
import { useAddresses, useCart, useCreateOrder, useQuote } from "../../lib/queries";
import { useToast } from "../../lib/toast";

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
    <div className={`flex justify-between ${strong ? "text-base font-semibold" : ""}`}>
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
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-xl font-semibold">Checkout</h1>
      {address && (
        <section className="rounded-lg border p-3 text-sm">
          <div className="flex justify-between">
            <p className="font-medium">{address.label}</p>
            <Link to={`/b/${branchId}/address`} className="text-primary">
              Ubah
            </Link>
          </div>
          <p>{address.street}</p>
          <p className="text-muted-foreground">
            {address.receiver_name} · {address.receiver_phone}
          </p>
        </section>
      )}

      <section className="space-y-2 rounded-lg border p-3 text-sm">
        <p className="font-medium">Metode pembayaran</p>
        {PAYMENT_METHODS.map((m) => (
          <label key={m} className="flex items-center gap-2">
            <input type="radio" name="pm" checked={paymentMethod === m} onChange={() => setPaymentMethod(m)} />
            {METHOD_LABEL[m]}
          </label>
        ))}
      </section>

      <section className="space-y-1 rounded-lg border p-3 text-sm" aria-live="polite">
        {quote.isLoading && <p className="text-muted-foreground">Menghitung harga…</p>}
        {quote.isError && <p className="text-destructive">{errorMessage(quote.error)}</p>}
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
            <hr className="my-2" />
            <Row label="Total" value={formatIDR(b.grand_total)} strong />
          </>
        )}
      </section>

      <button
        onClick={place}
        disabled={!b || createOrder.isPending}
        className="w-full rounded-md bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
      >
        {createOrder.isPending ? "Memproses…" : "Bayar"}
      </button>
      <p className="text-center text-xs text-muted-foreground">Anda akan diarahkan ke halaman pembayaran.</p>
    </main>
  );
}
