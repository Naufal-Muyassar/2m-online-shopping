import { Link, useParams } from "react-router-dom";
import { formatIDR } from "@2m/shared";
import { errorMessage } from "../../lib/api";
import { useCart, useCartMutations } from "../../lib/queries";
import { useToast } from "../../lib/toast";

export function CartPage() {
  const { branchId = "" } = useParams();
  const toast = useToast();
  const { data: cart, isLoading, isError } = useCart(branchId);
  const { setQty, remove } = useCartMutations(branchId);
  const busy = setQty.isPending || remove.isPending;
  const fail = (e: unknown) => toast("error", errorMessage(e));

  if (isLoading) return <p className="p-4 text-sm text-muted-foreground">Memuat…</p>;
  if (isError || !cart) return <p className="p-4 text-sm text-destructive">Gagal memuat keranjang.</p>;

  const underMin = cart.subtotal < cart.limits.min_order;
  const weightPct = Math.min(100, (cart.total_weight_kg / cart.limits.max_order_weight_kg) * 100);

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-xl font-semibold">Keranjang</h1>
      {cart.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Keranjang kosong.{" "}
          <Link to={`/b/${branchId}`} className="text-primary underline">
            Belanja sekarang
          </Link>
        </p>
      ) : (
        <>
          <ul className="divide-y rounded-lg border">
            {cart.items.map((i) => (
              <li key={i.product_id} className="flex items-center gap-3 p-3">
                <div className="flex-1">
                  <p className="text-sm font-medium">{i.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatIDR(i.price)} / {i.unit} · {i.weight_kg} kg
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    aria-label="Kurangi"
                    disabled={busy || i.qty <= 1}
                    onClick={() => setQty.mutate({ productId: i.product_id, qty: i.qty - 1 }, { onError: fail })}
                    className="h-8 w-8 rounded-md border disabled:opacity-50"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm">{i.qty}</span>
                  <button
                    aria-label="Tambah"
                    disabled={busy || i.qty >= cart.limits.max_qty_per_sku}
                    onClick={() => setQty.mutate({ productId: i.product_id, qty: i.qty + 1 }, { onError: fail })}
                    className="h-8 w-8 rounded-md border disabled:opacity-50"
                  >
                    +
                  </button>
                </div>
                <p className="w-24 text-right text-sm font-medium">{formatIDR(i.line_total)}</p>
                <button
                  aria-label={`Hapus ${i.name}`}
                  disabled={busy}
                  onClick={() => remove.mutate(i.product_id, { onError: fail })}
                  className="text-sm text-destructive disabled:opacity-50"
                >
                  Hapus
                </button>
              </li>
            ))}
          </ul>

          <div className="space-y-2 rounded-lg border p-3 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-semibold">{formatIDR(cart.subtotal)}</span>
            </div>
            <div>
              <div className="flex justify-between text-muted-foreground">
                <span>Berat</span>
                <span>
                  {cart.total_weight_kg} / {cart.limits.max_order_weight_kg} kg
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded bg-secondary">
                <div className="h-full rounded bg-primary" style={{ width: `${weightPct}%` }} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Maksimal {cart.limits.max_qty_per_sku} per produk.</p>
            {cart.is_bulk_order && <p className="text-xs text-muted-foreground">Pesanan besar: pengantaran bisa lebih lama.</p>}
            {underMin && (
              <p className="text-xs text-destructive">Minimal belanja {formatIDR(cart.limits.min_order)}.</p>
            )}
          </div>

          {underMin ? (
            <button disabled className="w-full rounded-md bg-primary px-3 py-2 text-primary-foreground opacity-50">
              Lanjut
            </button>
          ) : (
            <Link to={`/b/${branchId}/address`} className="block rounded-md bg-primary px-3 py-2 text-center text-primary-foreground">
              Lanjut ke alamat
            </Link>
          )}
        </>
      )}
    </main>
  );
}
