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
import { IconPlus, IconSearch } from "../../components/Icons";
import { QtyStepper } from "../../components/QtyStepper";
import { btnSecondary, EmptyState, ErrorCard, rise } from "../../components/States";

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

function BannerArt() {
  return (
    <svg viewBox="0 0 120 104" className="h-24 w-28 shrink-0" aria-hidden="true" focusable="false">
      <path d="M44 34h46l6 62H38z" fill="hsl(var(--surface))" />
      <path d="M56 42V28c0-22 22-22 22 0v14" fill="none" stroke="hsl(var(--primary-surface))" strokeWidth="4" strokeLinecap="round" />
      <path d="M14 48h38l5 48H9z" fill="hsl(var(--promo))" />
      <path d="M24 56V42c0-17 18-17 18 0v14" fill="none" stroke="hsl(var(--surface))" strokeWidth="3.5" strokeLinecap="round" />
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
    <li className="flex animate-rise flex-col gap-2" style={rise(index)}>
      <div className={cn("relative flex aspect-[4/3] items-center justify-center rounded-lg text-5xl", categoryTint(p.category), out && "opacity-60")}>
        <CategoryIcon category={p.category} />
        {(out || atLimit || low) && (
          <span className={cn("pill absolute left-2 top-2 px-2 py-0.5 ring-2 ring-surface", out ? "pill-danger" : atLimit ? "pill-info" : "pill-warning")}>
            {out ? "Habis" : atLimit ? "Batas tercapai" : `Stok: ${p.sellable_qty}`}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-0.5">
        <p className="line-clamp-2 text-sm font-bold">{p.name}</p>
        <p className="text-xs text-muted-foreground">
          per {p.unit} · {p.weight_kg} kg
        </p>
        <p className="mt-auto pt-1 font-bold">{formatIDR(p.price)}</p>
      </div>
      {qty > 0 ? (
        <QtyStepper
          name={p.name}
          qty={qty}
          canDecrease={!busy}
          canIncrease={!busy && !atLimit}
          onDecrease={() => onSetQty(qty - 1)}
          onIncrease={() => onSetQty(qty + 1)}
        />
      ) : (
        <button
          type="button"
          disabled={out || busy}
          onClick={onAdd}
          aria-label={`Tambah ${p.name}`}
          className="flex min-h-11 items-center justify-center gap-1 rounded-full bg-primary text-sm font-bold text-primary-foreground hover:bg-primary-pressed disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
        >
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
  const productsRef = useRef<HTMLHeadingElement>(null);
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
    <main className="app-main gap-5 pt-1">
      {branch && browsing && (
        <section className="flex items-center justify-between gap-2 overflow-hidden rounded-2xl bg-hero px-5 py-5 text-primary-foreground shadow-glow">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">Sembako harian, diantar ke rumah</h1>
            <p className="mt-1 text-sm opacity-90">Jangkauan {(branch.service_radius_m / 1000).toFixed(1)} km dari toko</p>
            <button
              type="button"
              onClick={() => productsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="mt-3 inline-flex min-h-11 items-center rounded-full bg-surface px-5 text-sm font-bold text-primary"
            >
              Mulai belanja
            </button>
          </div>
          <BannerArt />
        </section>
      )}

      <div className="sticky-toolbar top-0 space-y-2">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xl text-muted-foreground" />
          <input
            id={CATALOG_SEARCH_ID}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari produk…"
            className="field rounded-full pl-10"
            aria-label="Cari produk"
          />
        </div>
        <div className="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4">
          {[undefined, ...(data?.categories ?? [])].map((c) => (
            <button
              key={c ?? "all"}
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={cn(
                "inline-flex min-h-11 shrink-0 snap-start items-center whitespace-nowrap rounded-md border px-4 text-sm capitalize",
                category === c ? "border-primary bg-primary font-bold text-primary-foreground" : "border-border bg-surface hover:bg-muted",
              )}
            >
              {c ?? "Semua"}
            </button>
          ))}
        </div>
      </div>

      {browsing && data && data.categories.length > 0 && (
        <section aria-labelledby="categories-heading" className="flex flex-col gap-3">
          <h2 id="categories-heading" className="text-lg font-bold">
            Kategori
          </h2>
          <ul className="-mx-4 flex gap-3 overflow-x-auto px-4">
            {data.categories.map((c) => (
              <li key={c} className="shrink-0">
                <button type="button" onClick={() => setCategory(c)} className="flex w-16 flex-col items-center gap-1 text-xs capitalize">
                  <span className={cn("flex size-14 items-center justify-center rounded-lg text-2xl", categoryTint(c))}>
                    <CategoryIcon category={c} />
                  </span>
                  <span className="line-clamp-2 text-center">{c}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="products-heading" className="flex flex-col gap-3">
        <h2 id="products-heading" ref={productsRef} className={cn("scroll-mt-32 text-lg font-bold", category && "capitalize")}>
          {category ?? (q ? `Hasil untuk "${q}"` : "Semua produk")}
        </h2>
        {isLoading && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4" aria-busy="true" aria-label="Memuat">
            {[0, 1, 2, 3].map((n) => (
              <div key={n} className="skeleton h-56 rounded-lg" />
            ))}
          </div>
        )}
        {isError && <ErrorCard message="Gagal memuat produk." />}
        {data && data.products.length === 0 && <EmptyState icon={<IconSearch />} title="Produk tidak ditemukan." />}
        <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4">
          {data?.products.map((p, i) => (
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
      </section>

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
