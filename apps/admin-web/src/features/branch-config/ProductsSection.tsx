import { useDeferredValue, useState } from "react";
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  formatIDR,
  type AddBranchProductRequest,
  type AdminProduct,
  type AdminProductsResponse,
  type AdminProductUpdate,
  type CatalogProduct,
  type CatalogResponse,
} from "@2m/shared";
import { Dialog } from "../../components/Dialog";
import { IconChevronRight, IconSearch } from "../../components/Icons";
import { api, errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../lib/toast";
import { useBranch } from "./BranchProvider";

export const PRODUCTS_KEY = "admin-products";
const AVAILABLE_KEY = "admin-products-available";
// Same threshold as the customer catalogue's "Stok menipis".
const LOW_STOCK_AT = 5;

function statusOf(p: AdminProduct): { label: string; pill: string } {
  if (!p.is_active) return { label: "Disembunyikan", pill: "" };
  if (p.sellable_qty <= 0) return { label: "Habis", pill: "pill-danger" };
  if (p.sellable_qty <= LOW_STOCK_AT) return { label: "Menipis", pill: "pill-warning" };
  return { label: "Dijual", pill: "pill-success" };
}

const digitsOnly = (s: string) => s.replace(/\D/g, "");
export const weightLabel = (kg: number) => `${String(kg).replace(".", ",")} kg`;

// Price, stock and visibility: the three things that belong to one branch.
function BranchFields({
  price,
  stock,
  active,
  onPrice,
  onStock,
  onActive,
  disabled,
}: {
  price: string;
  stock: string;
  active: boolean;
  onPrice: (v: string) => void;
  onStock: (v: string) => void;
  onActive: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <label className="field-label flex flex-col gap-1.5">
          Harga (Rp)
          <input
            className="field tabular-nums"
            inputMode="numeric"
            autoComplete="off"
            maxLength={9}
            value={price}
            onChange={(e) => onPrice(digitsOnly(e.target.value))}
            disabled={disabled}
            aria-invalid={price !== "" && Number(price) <= 0}
          />
        </label>
        <label className="field-label flex flex-col gap-1.5">
          Stok tersedia
          <input
            className="field tabular-nums"
            inputMode="numeric"
            autoComplete="off"
            maxLength={7}
            value={stock}
            onChange={(e) => onStock(digitsOnly(e.target.value))}
            disabled={disabled}
            aria-describedby="stock-help"
          />
        </label>
      </div>
      <p id="stock-help" className="-mt-2 text-sm text-muted-foreground">
        Jumlah yang masih bisa dipesan. Unit yang sudah dipesan pelanggan tidak ikut dihitung.
      </p>
      <label className="option-row" data-selected={active}>
        <input
          type="checkbox"
          className="size-5 shrink-0 accent-primary"
          checked={active}
          onChange={(e) => onActive(e.target.checked)}
          disabled={disabled}
        />
        Tampilkan di katalog pelanggan
      </label>
    </>
  );
}

function ProductDetails({ p, isSuper }: { p: Pick<CatalogProduct, "sku" | "unit" | "category" | "weight_kg">; isSuper: boolean }) {
  return (
    <div className="flex flex-col gap-1 border-y border-border py-3 text-sm">
      <p className="tabular-nums">
        <span className="font-semibold">SKU {p.sku}</span> · {p.unit} · <span className="capitalize">{p.category}</span> ·{" "}
        {weightLabel(p.weight_kg)}
      </p>
      <p className="text-muted-foreground">
        {isSuper ? "Detail produk diubah di Config › Katalog." : "Detail produk sama di semua cabang dan diatur super admin."}
      </p>
    </div>
  );
}

function ProductDialog({ product, onClose }: { product: AdminProduct; onClose: () => void }) {
  const { user } = useAuth();
  const { branchId } = useBranch();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [price, setPrice] = useState(String(product.price));
  const [stock, setStock] = useState(String(product.sellable_qty));
  const [active, setActive] = useState(product.is_active);

  // Only what changed is sent, so a stock count is never overwritten by the number the dialog opened with.
  const changes: AdminProductUpdate = {};
  if (Number(price) !== product.price) changes.price = Number(price);
  if (stock !== "" && Number(stock) !== product.sellable_qty) changes.sellable_qty = Number(stock);
  if (active !== product.is_active) changes.is_active = active;
  const invalid = Number(price) <= 0 || stock === "";
  const dirty = Object.keys(changes).length > 0;

  const save = useMutation({
    mutationFn: async () =>
      (await api.patch<AdminProduct>(`/admin/products/${product.id}`, { ...changes, branch_id: branchId })).data,
    onSuccess: (saved) => {
      toast("success", `${saved.name} disimpan`);
      onClose();
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: [PRODUCTS_KEY, branchId] }),
  });
  const busy = save.isPending;

  return (
    <Dialog title={product.name}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty && !invalid) save.mutate();
        }}
      >
        <ProductDetails p={product} isSuper={user?.role === "super_admin"} />
        <BranchFields
          price={price}
          stock={stock}
          active={active}
          onPrice={setPrice}
          onStock={setStock}
          onActive={setActive}
          disabled={busy}
        />
        {save.isError && (
          <p className="alert-box" role="alert">
            {errorMessage(save.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Batal
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !dirty || invalid}>
            {busy ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// Step 1 picks a catalogue product this branch does not sell; step 2 sets its price and stock here.
function AddProductDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { branchId, branchName } = useBranch();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [picked, setPicked] = useState<CatalogProduct | null>(null);
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [active, setActive] = useState(true);

  const available = useQuery({
    queryKey: [AVAILABLE_KEY, branchId, q],
    queryFn: async () =>
      (await api.get<CatalogResponse>("/admin/products/available", { params: { branch_id: branchId, q: q || undefined } }))
        .data,
    placeholderData: keepPreviousData,
  });
  const rows = available.data?.products ?? [];

  const add = useMutation({
    mutationFn: async () => {
      const body: AddBranchProductRequest = {
        product_id: picked!.id,
        price: Number(price),
        sellable_qty: Number(stock || 0),
        is_active: active,
      };
      return (await api.post<AdminProduct>("/admin/products", { ...body, branch_id: branchId })).data;
    },
    onSuccess: (p) => {
      toast("success", `${p.name} sekarang dijual di ${branchName ?? "cabang ini"}`);
      onClose();
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: [PRODUCTS_KEY, branchId] });
      void queryClient.invalidateQueries({ queryKey: [AVAILABLE_KEY, branchId] });
    },
  });
  const busy = add.isPending;

  if (picked)
    return (
      <Dialog title={`Jual ${picked.name}`}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (Number(price) > 0) add.mutate();
          }}
        >
          <ProductDetails p={picked} isSuper={user?.role === "super_admin"} />
          <BranchFields
            price={price}
            stock={stock}
            active={active}
            onPrice={setPrice}
            onStock={setStock}
            onActive={setActive}
            disabled={busy}
          />
          {add.isError && (
            <p className="alert-box" role="alert">
              {errorMessage(add.error)}
            </p>
          )}
          <div className="flex justify-between gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setPicked(null)} disabled={busy}>
              Kembali
            </button>
            <span className="flex gap-2">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
                Batal
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy || !(Number(price) > 0)}>
                {busy ? "Menambahkan…" : "Tambahkan"}
              </button>
            </span>
          </div>
        </form>
      </Dialog>
    );

  return (
    <Dialog title="Tambah produk" wide>
      <p className="-mt-2 text-muted-foreground">Pilih produk dari katalog yang belum dijual di {branchName ?? "cabang ini"}.</p>
      <div className="relative">
        <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lg text-muted-foreground" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama atau SKU…"
          aria-label="Cari produk katalog"
          className="field pl-10"
          autoFocus
        />
      </div>
      {available.isLoading && <div className="skeleton h-40" role="status" aria-busy="true" aria-label="Memuat" />}
      {available.isError && (
        <p className="alert-box" role="alert">
          {errorMessage(available.error)}
        </p>
      )}
      {available.isSuccess && rows.length === 0 && (
        <div className="empty-state">
          <p>
            {q
              ? `Tidak ada produk katalog yang cocok dengan “${q}”.`
              : "Semua produk di katalog sudah dijual di cabang ini. Minta super admin membuat SKU baru."}
          </p>
        </div>
      )}
      {rows.length > 0 && (
        <ul className="list max-h-[50dvh] overflow-y-auto">
          {rows.map((p) => (
            <li key={p.id}>
              <button type="button" className="list-row w-full text-left" onClick={() => setPicked(p)}>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{p.name}</span>
                  <span className="t-label mt-0.5 block tabular-nums">
                    {p.sku} · {p.unit} · {weightLabel(p.weight_kg)}
                    {p.branches.length > 0 && ` · dijual di ${p.branches.length} cabang lain`}
                  </span>
                </span>
                <IconChevronRight aria-hidden="true" className="row-arrow text-lg" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end">
        <button className="btn btn-secondary" onClick={onClose}>
          Tutup
        </button>
      </div>
    </Dialog>
  );
}

export function ProductsSection() {
  const { branchId } = useBranch();
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [open, setOpen] = useState<{ dialog: "edit"; id: string } | { dialog: "add" } | null>(null);

  const products = useInfiniteQuery({
    queryKey: [PRODUCTS_KEY, branchId, q],
    queryFn: async ({ pageParam }) =>
      (
        await api.get<AdminProductsResponse>("/admin/products", {
          params: { branch_id: branchId, q: q || undefined, page: pageParam },
        })
      ).data,
    initialPageParam: 1,
    getNextPageParam: (last) => (last.has_more ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });
  const rows = products.data?.pages.flatMap((p) => p.products) ?? [];
  const editing = open?.dialog === "edit" ? rows.find((p) => p.id === open.id) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lg text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama atau SKU…"
            aria-label="Cari produk"
            className="field pl-10"
          />
        </div>
        <button className="btn btn-primary self-start sm:self-auto" onClick={() => setOpen({ dialog: "add" })}>
          Tambah produk
        </button>
      </div>

      {products.isLoading && (
        <div className="space-y-3" role="status" aria-busy="true" aria-label="Memuat">
          <div className="skeleton h-14" />
          <div className="skeleton h-14" />
          <div className="skeleton h-14" />
        </div>
      )}
      {products.isError && (
        <p className="alert-box" role="alert">
          {errorMessage(products.error)}
        </p>
      )}
      {products.isSuccess && rows.length === 0 && (
        <div className="empty-state">
          <p>
            {q
              ? `Tidak ada produk yang cocok dengan “${q}”.`
              : "Cabang ini belum menjual produk. Pakai Tambah produk untuk memilih dari katalog."}
          </p>
        </div>
      )}
      {rows.length > 0 && (
        <div className="card animate-rise overflow-hidden p-0 md:p-0">
          <table className="data-table">
            <thead>
              <tr>
                <th>Produk</th>
                <th>Kategori</th>
                <th className="text-right">Harga</th>
                <th className="text-right">Stok</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const status = statusOf(p);
                return (
                  <tr key={p.id}>
                    <td data-primary>
                      <span className="block font-bold">{p.name}</span>
                      <span className="t-label mt-0.5 block tabular-nums">
                        {p.sku} · {p.unit}
                      </span>
                    </td>
                    <td data-label="Kategori" className="capitalize">
                      {p.category}
                    </td>
                    <td data-label="Harga" className="font-bold tabular-nums md:text-right">
                      {formatIDR(p.price)}
                    </td>
                    <td data-label="Stok" className="font-bold tabular-nums md:text-right">
                      {p.sellable_qty}
                    </td>
                    <td data-label="Status">
                      <span className={`pill pill-dot ${status.pill}`}>{status.label}</span>
                    </td>
                    <td data-actions className="md:text-right">
                      <button className="btn btn-secondary btn-sm" onClick={() => setOpen({ dialog: "edit", id: p.id })}>
                        Ubah
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {products.hasNextPage && (
        <button
          className="btn btn-secondary self-center"
          onClick={() => void products.fetchNextPage()}
          disabled={products.isFetchingNextPage}
        >
          {products.isFetchingNextPage ? "Memuat…" : "Muat lagi"}
        </button>
      )}
      {editing && <ProductDialog product={editing} onClose={() => setOpen(null)} />}
      {open?.dialog === "add" && <AddProductDialog onClose={() => setOpen(null)} />}
    </div>
  );
}
