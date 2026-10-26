import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { formatIDR } from "@2m/shared";
import { useAuth } from "../../lib/auth";
import { errorMessage } from "../../lib/api";
import { useCart, useCartMutations, useProducts } from "../../lib/queries";
import { useToast } from "../../lib/toast";
import { cn } from "../../lib/utils";
import { IconSearch } from "../../components/Icons";
import { btnPrimary, btnSecondary, EmptyState, ErrorCard, rise } from "../../components/States";

// Exact remaining stock is shown only at or below this level.
const STOCK_NOTICE_AT = 20;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function CatalogPage() {
  const { branchId = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const q = useDebounced(search.trim(), 300);
  const { data, isLoading, isError } = useProducts(branchId, category, q, page);
  const { add } = useCartMutations(branchId);
  const cart = useCart(branchId, !!user).data;
  const qtyInCart = new Map(cart?.items.map((i) => [i.product_id, i.qty]));
  const maxPerSku = cart?.limits.max_qty_per_sku ?? Infinity;

  useEffect(() => setPage(1), [q, category]);

  function addToCart(productId: string, name: string) {
    if (!user) {
      navigate("/login", { state: { from: location.pathname } });
      return;
    }
    add.mutate(
      { product_id: productId, qty: 1 },
      { onSuccess: () => toast("success", `${name} ditambahkan`), onError: (e) => toast("error", errorMessage(e)) },
    );
  }

  return (
    <main className="app-main">
      <div className="sticky-toolbar space-y-2">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xl text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari produk…"
            className="field pl-10"
            aria-label="Cari produk"
          />
        </div>
        <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4">
          {[undefined, ...(data?.categories ?? [])].map((c) => (
            <button
              key={c ?? "all"}
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={cn(
                "inline-flex min-h-11 shrink-0 snap-start items-center whitespace-nowrap rounded-full border px-4 text-sm capitalize",
                category === c ? "border-primary bg-primary-surface font-bold text-primary-pressed" : "border-border bg-surface hover:bg-muted",
              )}
            >
              {c ?? "Semua"}
            </button>
          ))}
        </div>
      </div>
      {isLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4" aria-busy="true" aria-label="Memuat">
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className="skeleton h-48 rounded-lg" />
          ))}
        </div>
      )}
      {isError && <ErrorCard message="Gagal memuat produk." />}
      {data && data.products.length === 0 && (
        <EmptyState icon={<IconSearch />} title="Produk tidak ditemukan." />
      )}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {data?.products.map((p, i) => {
          const out = p.sellable_qty <= 0;
          const low = p.sellable_qty <= STOCK_NOTICE_AT;
          const atLimit = (qtyInCart.get(p.id) ?? 0) >= Math.min(p.sellable_qty, maxPerSku);
          return (
            <li key={p.id} className="card flex animate-rise flex-col justify-between p-3" style={rise(i)}>
              <div className="space-y-1">
                <p className="text-sm font-bold">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  per {p.unit} · {p.weight_kg} kg
                </p>
                <span className={cn("pill", out ? "pill-danger" : low ? "pill-warning" : "pill-success")}>
                  {out ? "Habis" : low ? `Stok: ${p.sellable_qty}` : "Tersedia"}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                <p className="text-base font-bold">{formatIDR(p.price)}</p>
                <button
                  disabled={out || atLimit || add.isPending}
                  onClick={() => addToCart(p.id, p.name)}
                  className={cn(btnPrimary, "w-full px-3 text-sm")}
                >
                  {out ? "Habis" : atLimit ? "Batas tercapai" : "Tambah"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {data && (page > 1 || data.has_more) && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className={cn(btnSecondary, "px-4 text-sm")}>
            Sebelumnya
          </button>
          <span>Halaman {page}</span>
          <button disabled={!data.has_more} onClick={() => setPage(page + 1)} className={cn(btnSecondary, "px-4 text-sm")}>
            Berikutnya
          </button>
        </div>
      )}
    </main>
  );
}
