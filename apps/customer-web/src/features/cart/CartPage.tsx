import { Link, useParams } from "react-router-dom";
import { formatIDR } from "@2m/shared";
import { errorMessage } from "../../lib/api";
import { useCart, useCartMutations } from "../../lib/queries";
import { useToast } from "../../lib/toast";
import { IconArrowRight, IconCart, IconPackage } from "../../components/Icons";
import { QtyStepper } from "../../components/QtyStepper";
import { EmptyState, ErrorCard, PageSkeleton, rise } from "../../components/States";

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
      <h1 className="t-headline">Keranjang</h1>
      {cart.items.length === 0 ? (
        <EmptyState icon={<IconCart />} title="Keranjang kosong.">
          <Link to={`/b/${branchId}`} className="btn btn-secondary mt-2">
            Belanja sekarang
          </Link>
        </EmptyState>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
          <ul className="list">
            {cart.items.map((i, idx) => (
              <li key={i.product_id} className="flex animate-rise gap-3 p-3 sm:gap-4 sm:p-4" style={rise(idx)}>
                <span className="flex size-16 shrink-0 items-center justify-center rounded-md bg-muted text-2xl sm:size-20 sm:text-3xl">
                  <IconPackage />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold leading-snug">{i.name}</p>
                      <p className="t-label mt-1">
                        {formatIDR(i.price)} / {i.unit} · {i.weight_kg} kg
                      </p>
                    </div>
                    <button
                      aria-label={`Hapus ${i.name}`}
                      disabled={busy}
                      onClick={() => remove.mutate(i.product_id, { onError: fail })}
                      className="link link-danger -mt-2.5 shrink-0 text-sm disabled:opacity-50"
                    >
                      Hapus
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <QtyStepper
                      className="w-32"
                      name={i.name}
                      qty={i.qty}
                      canDecrease={!busy && i.qty > 1}
                      canIncrease={!busy && i.qty < cart.limits.max_qty_per_sku}
                      onDecrease={() => setQty.mutate({ productId: i.product_id, qty: i.qty - 1 }, { onError: fail })}
                      onIncrease={() => setQty.mutate({ productId: i.product_id, qty: i.qty + 1 }, { onError: fail })}
                    />
                    <p className="text-right font-extrabold tabular-nums tracking-tight">{formatIDR(i.line_total)}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <aside className="card flex flex-col gap-4 lg:sticky lg:top-24">
            <div>
              <p className="t-label">Subtotal</p>
              <p className="t-figure mt-1">{formatIDR(cart.subtotal)}</p>
            </div>
            <div className="border-t border-border pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Berat</span>
                <span className="font-semibold tabular-nums">
                  {cart.total_weight_kg} / {cart.limits.max_order_weight_kg} kg
                </span>
              </div>
              <div className="meter mt-2">
                <div className="meter-fill" style={{ width: `${weightPct}%` }} />
              </div>
              <p className="t-label mt-2">Maksimal {cart.limits.max_qty_per_sku} per produk.</p>
            </div>
            {cart.is_bulk_order && <p className="notice">Pesanan besar: pengantaran bisa lebih lama.</p>}
            {underMin && <p className="alert-box">Minimal belanja {formatIDR(cart.limits.min_order)}.</p>}
            {underMin ? (
              <button disabled className="btn btn-primary btn-lg btn-block">
                Lanjut
              </button>
            ) : (
              <Link to={`/b/${branchId}/address`} className="btn btn-primary btn-lg btn-block group">
                Lanjut ke alamat
                <IconArrowRight className="transition-transform duration-200 ease-settle group-hover:translate-x-0.5" />
              </Link>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
