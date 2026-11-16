import { Fragment, useEffect } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { isAxiosError } from "axios";
import { formatIDR, type ProductDetail } from "@2m/shared";
import { useAuth } from "../../lib/auth";
import { errorMessage } from "../../lib/api";
import { capMessage, qtyCap, useCartSync } from "../../lib/cart";
import { useBranches, useCart, useProduct } from "../../lib/queries";
import { useToast } from "../../lib/toast";
import { cn } from "../../lib/utils";
import { IconBack, IconCart, IconPackage, IconPlus } from "../../components/Icons";
import { QtyStepper } from "../../components/QtyStepper";
import { EmptyState, ErrorCard } from "../../components/States";
import { ProductGallery } from "./ProductGallery";

// Same thresholds as the catalogue card.
const STOCK_NOTICE_AT = 20;

const weightText = (kg: number) => (kg < 1 ? `${Math.round(kg * 1000)} g` : `${String(kg).replace(".", ",")} kg`);

function stockLine(p: ProductDetail): { text: string; pill: string } {
  if (p.sellable_qty <= 0) return { text: "Stok habis", pill: "pill-danger" };
  if (p.sellable_qty <= STOCK_NOTICE_AT) return { text: `Sisa ${p.sellable_qty} ${p.unit}`, pill: "pill-warning" };
  return { text: "Stok tersedia", pill: "pill-success" };
}

function BackLink({ branchId }: { branchId: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  // Opened from the catalogue: go back, so its filters and scroll position come back too.
  const fromCatalog = (location.state as { fromCatalog?: boolean } | null)?.fromCatalog === true;
  const className = "btn btn-secondary btn-sm self-start";
  return fromCatalog ? (
    <button type="button" className={className} onClick={() => navigate(-1)}>
      <IconBack aria-hidden="true" /> Kembali ke katalog
    </button>
  ) : (
    <Link to={`/b/${branchId}`} className={className}>
      <IconBack aria-hidden="true" /> Lihat katalog
    </Link>
  );
}

function PageSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-10" role="status" aria-busy="true" aria-label="Memuat">
      <div className="skeleton aspect-square rounded-lg" />
      <div className="flex flex-col gap-4">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-10 w-3/4" />
        <div className="skeleton h-9 w-40" />
        <div className="skeleton h-12" />
        <div className="skeleton h-24" />
      </div>
    </div>
  );
}

export function ProductPage() {
  const { branchId = "", productId = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const product = useProduct(branchId, productId);
  const branch = useBranches().data?.find((b) => b.id === branchId);
  const cart = useCart(branchId, !!user).data;
  const sync = useCartSync(branchId, (e) => toast("error", errorMessage(e)));

  // Block body: newer browsers return a Promise from scrollTo, which React would take for a cleanup.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [productId]);

  const p = product.data;
  useEffect(() => {
    if (!p) return;
    const before = document.title;
    document.title = `${p.name} · 2M`;
    return () => {
      document.title = before;
    };
  }, [p?.name]);

  if (product.isLoading)
    return (
      <main className="app-main gap-6">
        <PageSkeleton />
      </main>
    );

  if (!p) {
    const missing = isAxiosError(product.error) && product.error.response?.status === 404;
    return (
      <main className="app-main gap-6">
        <BackLink branchId={branchId} />
        {missing ? (
          <EmptyState icon={<IconPackage />} title="Produk tidak dijual di cabang ini.">
            <p>Mungkin sudah disembunyikan toko. Cari produk lain di katalog.</p>
            <Link to={`/b/${branchId}`} className="btn btn-primary mt-2">
              Buka katalog
            </Link>
          </EmptyState>
        ) : (
          <ErrorCard message="Gagal memuat produk." onRetry={() => void product.refetch()} />
        )}
      </main>
    );
  }

  const qty = cart?.items.find((i) => i.product_id === p.id)?.qty ?? 0;
  const cap = qtyCap(cart, { product_id: p.id, weight_kg: p.weight_kg, sellable_qty: p.sellable_qty });
  const out = p.sellable_qty <= 0;
  const stock = stockLine(p);
  // The list row stands in while the page loads; its empty description is not the real one yet.
  const loadingDetail = product.isPlaceholderData;
  const specs = [
    ...p.specs,
    { label: "Satuan", value: p.unit },
    { label: "Berat", value: weightText(p.weight_kg) },
    { label: "Kategori", value: p.category.charAt(0).toUpperCase() + p.category.slice(1) },
    { label: "SKU", value: p.sku },
  ];

  function add() {
    if (!user) {
      navigate("/login", { state: { from: location.pathname } });
      return;
    }
    sync.add(p!);
    toast("success", `${p!.name} ditambahkan`);
  }

  return (
    <main className="app-main gap-6 md:gap-8">
      <BackLink branchId={branchId} />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14">
        <div className="min-w-0 md:sticky md:top-24 md:self-start">
          <ProductGallery images={p.image_urls} name={p.name} category={p.category} />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <section className="flex animate-rise flex-col gap-3" aria-labelledby="product-name">
            <p className="t-label capitalize">
              {p.category}
              {branch && ` · ${branch.name}`}
            </p>
            <h1 id="product-name" className="t-headline">
              {p.name}
            </h1>
            <p className="t-label">
              per {p.unit} · {weightText(p.weight_kg)}
            </p>
            <p className="t-figure mt-1">{formatIDR(p.price)}</p>
            <span className={cn("pill pill-dot self-start", stock.pill)}>{stock.text}</span>
          </section>

          <div className="flex flex-col gap-2 border-y border-border py-4">
            {qty > 0 ? (
              <>
                <QtyStepper
                  name={p.name}
                  qty={qty}
                  min={0}
                  max={cap.max}
                  onChange={(n) => sync.setQty(p.id, n)}
                  onClamp={() => toast("error", capMessage(cart, p.name, cap))}
                />
                <Link to={`/b/${branchId}/cart`} className="btn btn-secondary btn-block">
                  <IconCart aria-hidden="true" /> Lihat keranjang
                </Link>
              </>
            ) : (
              <button type="button" className="btn btn-primary btn-lg btn-block" disabled={out || cap.max <= 0} onClick={add}>
                <IconPlus aria-hidden="true" /> {out ? "Stok habis" : "Tambah ke keranjang"}
              </button>
            )}
            {!out && qty > 0 && qty >= cap.max && <p className="text-sm text-muted-foreground">{capMessage(cart, p.name, cap)}</p>}
          </div>

          <section className="flex flex-col gap-3" aria-labelledby="product-description">
            <div className="section-head">
              <h2 id="product-description" className="t-title">
                Deskripsi
              </h2>
            </div>
            {loadingDetail ? (
              <div className="flex flex-col gap-2" role="status" aria-busy="true" aria-label="Memuat deskripsi">
                <div className="skeleton h-4" />
                <div className="skeleton h-4 w-5/6" />
                <div className="skeleton h-4 w-2/3" />
              </div>
            ) : p.description ? (
              <p className="whitespace-pre-line leading-relaxed">{p.description}</p>
            ) : (
              <p className="text-muted-foreground">Toko belum menulis deskripsi untuk produk ini.</p>
            )}
          </section>

          <section className="flex flex-col gap-3" aria-labelledby="product-specs">
            <div className="section-head">
              <h2 id="product-specs" className="t-title">
                Spesifikasi
              </h2>
            </div>
            <dl className="spec-list">
              {specs.map((s, i) => (
                <Fragment key={`${s.label}-${i}`}>
                  <dt>{s.label}</dt>
                  <dd className={cn(s.label === "SKU" && "tabular-nums")}>{s.value}</dd>
                </Fragment>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </main>
  );
}
