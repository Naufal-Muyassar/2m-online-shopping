import { Link, useParams } from "react-router-dom";
import { formatIDR } from "@2m/shared";
import { errorMessage } from "../../lib/api";
import { useCart, useCartMutations } from "../../lib/queries";
import { useToast } from "../../lib/toast";
import { cn } from "../../lib/utils";
import { IconCart } from "../../components/Icons";
import { btnSecondary, EmptyState, ErrorCard, PageSkeleton, rise } from "../../components/States";

export function CartPage() {
  const { branchId = "" } = useParams();
  const toast = useToast();
  const { data: cart, isLoading, isError } = useCart(branchId);
  const { setQty, remove } = useCartMutations(branchId);
  const busy = setQty.isPending || remove.isPending;
  const fail = (e: unknown) => toast("error", errorMessage(e));

  if (isLoading) return <PageSkeleton />;
  if (isError || !cart) {
    return (
      <main className="app-main">
        <ErrorCard message="Gagal memuat keranjang." />
      </main>
    );
  }

  const underMin = cart.subtotal < cart.limits.min_order;
  const weightPct = Math.min(100, (cart.total_weight_kg / cart.limits.max_order_weight_kg) * 100);

  return (
    <main className="app-main">
      <h1 className="text-2xl font-bold">Keranjang</h1>
      {cart.items.length === 0 ? (
        <EmptyState icon={<IconCart />} title="Keranjang kosong.">
          <Link to={`/b/${branchId}`} className={cn(btnSecondary, "mt-2")}>
            Belanja sekarang
          </Link>
        </EmptyState>
      ) : (
        <>
          <ul className="space-y-3">
            {cart.items.map((i, idx) => (
              <li key={i.product_id} className="card animate-rise space-y-3" style={rise(idx)}>
                <div>
                  <p className="font-bold">{i.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatIDR(i.price)} / {i.unit} · {i.weight_kg} kg
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    aria-label="Kurangi"
                    disabled={busy || i.qty <= 1}
                    onClick={() => setQty.mutate({ productId: i.product_id, qty: i.qty - 1 }, { onError: fail })}
                    className="icon-btn text-2xl disabled:opacity-50"
                  >
                    −
                  </button>
                  <span className="w-8 text-center font-bold">{i.qty}</span>
                  <button
                    aria-label="Tambah"
                    disabled={busy || i.qty >= cart.limits.max_qty_per_sku}
                    onClick={() => setQty.mutate({ productId: i.product_id, qty: i.qty + 1 }, { onError: fail })}
                    className="icon-btn text-2xl disabled:opacity-50"
                  >
                    +
                  </button>
                  <p className="ml-auto text-right font-bold">{formatIDR(i.line_total)}</p>
                </div>
                <div className="card-footer flex justify-end">
                  <button
                    aria-label={`Hapus ${i.name}`}
                    disabled={busy}
                    onClick={() => remove.mutate(i.product_id, { onError: fail })}
                    className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-destructive disabled:opacity-50"
                  >
                    Hapus
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="card space-y-2 text-sm">
            <div className="flex justify-between text-base">
              <span>Subtotal</span>
              <span className="font-bold">{formatIDR(cart.subtotal)}</span>
            </div>
            <div>
              <div className="flex justify-between text-muted-foreground">
                <span>Berat</span>
                <span>
                  {cart.total_weight_kg} / {cart.limits.max_order_weight_kg} kg
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${weightPct}%` }} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Maksimal {cart.limits.max_qty_per_sku} per produk.</p>
            {cart.is_bulk_order && <p className="notice">Pesanan besar: pengantaran bisa lebih lama.</p>}
            {underMin && <p className="alert-box">Minimal belanja {formatIDR(cart.limits.min_order)}.</p>}
          </div>

          {underMin ? (
            <button disabled className="btn-hero w-full">
              Lanjut
            </button>
          ) : (
            <Link to={`/b/${branchId}/address`} className="btn-hero w-full">
              Lanjut ke alamat
            </Link>
          )}
        </>
      )}
    </main>
  );
}
