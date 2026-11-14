import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { formatIDR, type Product } from "@2m/shared";
import { CATALOG_SEARCH_ID } from "../../app/Layout";
import { useAuth } from "../../lib/auth";
import { errorMessage } from "../../lib/api";
import { useBranches, useCart, useCartMutations, useProducts } from "../../lib/queries";
import { useToast } from "../../lib/toast";
import { cn } from "../../lib/utils";
import { CategoryIcon, categoryTint } from "../../components/category";
import { IconArrowRight, IconGrid, IconPlus, IconSearch } from "../../components/Icons";
import { QtyStepper } from "../../components/QtyStepper";
import { EmptyState, ErrorCard, rise } from "../../components/States";

// Exact remaining stock is shown only at or below this level.
const STOCK_NOTICE_AT = 20;

const PRODUCT_GRID = "grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 md:grid-cols-4 md:gap-x-4 lg:grid-cols-3 xl:grid-cols-4";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function BannerArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 104" className={className} aria-hidden="true" focusable="false">
      <path d="M44 34h46l6 62H38z" fill="hsl(var(--rail-foreground))" />
      <path d="M56 42V28c0-22 22-22 22 0v14" fill="none" stroke="hsl(var(--rail-muted))" strokeWidth="4" strokeLinecap="round" />
      <path d="M14 48h38l5 48H9z" fill="hsl(var(--promo))" />
      <path d="M24 56V42c0-17 18-17 18 0v14" fill="none" stroke="hsl(var(--rail-foreground))" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="67" cy="68" r="11" fill="hsl(var(--primary-surface))" />
      <path d="M61 68l4.5 4.5L74 64" fill="none" stroke="hsl(var(--primary))" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface CardProps {
  product: Product;
  index: number;
  qty: number;
  maxPerSku: number;
  busy: boolean;
  onAdd: () => void;
  onSetQty: (qty: number) => void;
}

function ProductCard({ product: p, index, qty, maxPerSku, busy, onAdd, onSetQty }: CardProps) {
  const out = p.sellable_qty <= 0;
  const low = p.sellable_qty <= STOCK_NOTICE_AT;
  const limit = Math.min(p.sellable_qty, maxPerSku);
  const atLimit = qty >= limit;

  return (
    <li className="group flex animate-rise flex-col" style={rise(index)}>
      <div
        className={cn(
          "relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-border text-5xl transition-colors duration-200 group-hover:border-foreground/40",
          categoryTint(p.category),
          out && "opacity-55",
        )}
      >
        <CategoryIcon category={p.category} className="transition-transform duration-300 ease-settle group-hover:scale-110" />
        {(out || atLimit || low) && (
          <span className={cn("pill absolute left-2 top-2", out ? "pill-danger" : atLimit ? "pill-info" : "pill-warning")}>
            {out ? "Habis" : atLimit ? "Batas tercapai" : `Stok: ${p.sellable_qty}`}
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-1 flex-col">
        <p className="line-clamp-2 text-sm font-bold leading-snug">{p.name}</p>
        <p className="t-label mt-1">
          per {p.unit} · {p.weight_kg} kg
        </p>
        <p className="mt-auto pt-2 text-[1.0625rem] font-extrabold tabular-nums tracking-tight">{formatIDR(p.price)}</p>
      </div>
      {qty > 0 ? (
        <QtyStepper
          className="mt-2.5"
          name={p.name}
          qty={qty}
          canDecrease={!busy}
          canIncrease={!busy && !atLimit}
          onDecrease={() => onSetQty(qty - 1)}
          onIncrease={() => onSetQty(qty + 1)}
        />
      ) : (
        <button type="button" disabled={out || busy} onClick={onAdd} aria-label={`Tambah ${p.name}`} className="btn btn-secondary btn-block mt-2.5">
          <IconPlus /> Tambah
        </button>
      )}
    </li>
  );
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
  const { add, setQty, remove } = useCartMutations(branchId);
  const branch = useBranches().data?.find((b) => b.id === branchId);
  const cart = useCart(branchId, !!user).data;
  const qtyInCart = new Map(cart?.items.map((i) => [i.product_id, i.qty]));
  const maxPerSku = cart?.limits.max_qty_per_sku ?? Infinity;
  const busy = add.isPending || setQty.isPending || remove.isPending;
  const productsRef = useRef<HTMLDivElement>(null);
  const browsing = !category && !search.trim();
  const fail = (e: unknown) => toast("error", errorMessage(e));

  useEffect(() => setPage(1), [q, category]);

  function addToCart(p: Product) {
    if (!user) {
      navigate("/login", { state: { from: location.pathname } });
      return;
    }
    add.mutate({ product_id: p.id, qty: 1 }, { onSuccess: () => toast("success", `${p.name} ditambahkan`), onError: fail });
  }

  function changeQty(p: Product, qty: number) {
    if (qty <= 0) remove.mutate(p.id, { onError: fail });
    else setQty.mutate({ productId: p.id, qty }, { onError: fail });
  }

  return (
    <main className="app-main gap-6 md:gap-10">
      {branch && browsing && (
        <section className="panel-ink flex animate-rise items-end justify-between gap-4 overflow-hidden p-5 sm:p-8 lg:p-12">
          <div className="min-w-0 max-w-2xl">
            <p className="t-label">Jangkauan {(branch.service_radius_m / 1000).toFixed(1)} km dari toko</p>
            <h1 className="t-display mt-3">Sembako harian, diantar ke rumah</h1>
            <button
              type="button"
              onClick={() => productsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="btn btn-invert group mt-6"
            >
              Mulai belanja
              <IconArrowRight className="transition-transform duration-200 ease-settle group-hover:translate-x-0.5" />
            </button>
          </div>
          <BannerArt className="hidden h-28 w-32 shrink-0 sm:block lg:h-40 lg:w-44" />
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
        <aside className="sticky top-16 z-10 -mx-4 flex min-w-0 flex-col gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur-md lg:top-24 lg:mx-0 lg:gap-5 lg:self-start lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lg text-muted-foreground" />
            <input
              id={CATALOG_SEARCH_ID}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari produk…"
              className="field pl-10"
              aria-label="Cari produk"
            />
          </div>
          <section aria-labelledby="categories-heading" className="flex flex-col gap-3">
            <div className="section-head hidden lg:flex">
              <h2 id="categories-heading" className="t-title">
                Kategori
              </h2>
            </div>
            <ul className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0">
              {[undefined, ...(data?.categories ?? [])].map((c) => (
                <li key={c ?? "all"} className="shrink-0 snap-start">
                  <button
                    type="button"
                    onClick={() => setCategory(c)}
                    aria-pressed={category === c}
                    className="chip capitalize lg:w-full lg:border-transparent lg:bg-transparent"
                  >
                    <span className="text-base">{c ? <CategoryIcon category={c} /> : <IconGrid />}</span>
                    {c ?? "Semua"}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>

        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="products-heading" className="flex flex-col gap-5">
            <div className="section-head scroll-mt-44 lg:scroll-mt-24" ref={productsRef}>
              <h2 id="products-heading" className={cn("t-title", category && "capitalize")}>
                {category ?? (q ? `Hasil untuk "${q}"` : "Semua produk")}
              </h2>
              {data && <span className="t-label tabular-nums">Halaman {page}</span>}
            </div>
            {isLoading && (
              <div className={PRODUCT_GRID} aria-busy="true" aria-label="Memuat">
                {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <div key={n} className="skeleton h-64 rounded-lg" />
                ))}
              </div>
            )}
            {isError && <ErrorCard message="Gagal memuat produk." />}
            {data && data.products.length === 0 && <EmptyState icon={<IconSearch />} title="Produk tidak ditemukan." />}
            {data && data.products.length > 0 && (
              <ul className={PRODUCT_GRID}>
                {data.products.map((p, i) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    index={i}
                    qty={qtyInCart.get(p.id) ?? 0}
                    maxPerSku={maxPerSku}
                    busy={busy}
                    onAdd={() => addToCart(p)}
                    onSetQty={(qty) => changeQty(p, qty)}
                  />
                ))}
              </ul>
            )}
          </section>

          {data && (page > 1 || data.has_more) && (
            <div className="flex items-center justify-between gap-3 border-t border-border pt-4 text-sm">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn btn-secondary">
                Sebelumnya
              </button>
              <span className="t-label tabular-nums">Halaman {page}</span>
              <button disabled={!data.has_more} onClick={() => setPage(page + 1)} className="btn btn-secondary">
                Berikutnya
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
