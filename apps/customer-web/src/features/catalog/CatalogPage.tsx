import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { formatIDR } from "@2m/shared";
import { useAuth } from "../../lib/auth";
import { errorMessage } from "../../lib/api";
import { useCartMutations, useProducts } from "../../lib/queries";
import { useToast } from "../../lib/toast";
import { cn } from "../../lib/utils";

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
    <main className="mx-auto max-w-4xl space-y-4 p-4">
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Cari produk…"
        className="w-full rounded-md border px-3 py-2"
        aria-label="Cari produk"
      />
      <div className="flex flex-wrap gap-2">
        {[undefined, ...(data?.categories ?? [])].map((c) => (
          <button
            key={c ?? "all"}
            onClick={() => setCategory(c)}
            className={cn("rounded-full border px-3 py-1 text-sm capitalize", category === c ? "bg-primary text-primary-foreground" : "hover:bg-secondary")}
          >
            {c ?? "Semua"}
          </button>
        ))}
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Memuat…</p>}
      {isError && <p className="text-sm text-destructive">Gagal memuat produk.</p>}
      {data && data.products.length === 0 && <p className="text-sm text-muted-foreground">Produk tidak ditemukan.</p>}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {data?.products.map((p) => (
          <li key={p.id} className="flex flex-col justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">{p.name}</p>
              <p className="text-xs text-muted-foreground">
                per {p.unit} · {p.weight_kg} kg
              </p>
            </div>
            <div className="mt-3 space-y-2">
              <p className="font-semibold">{formatIDR(p.price)}</p>
              <button
                disabled={p.stock_status === "out" || add.isPending}
                onClick={() => addToCart(p.id, p.name)}
                className="w-full rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
              >
                {p.stock_status === "out" ? "Habis" : "Tambah"}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {data && (page > 1 || data.has_more) && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-md border px-3 py-1.5 disabled:opacity-50">
            Sebelumnya
          </button>
          <span>Halaman {page}</span>
          <button disabled={!data.has_more} onClick={() => setPage(page + 1)} className="rounded-md border px-3 py-1.5 disabled:opacity-50">
            Berikutnya
          </button>
        </div>
      )}
    </main>
  );
}
