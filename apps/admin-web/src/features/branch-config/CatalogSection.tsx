import { useDeferredValue, useState } from "react";
import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CatalogProduct, CatalogResponse, CreateCatalogProduct, UpdateCatalogProduct } from "@2m/shared";
import { Dialog } from "../../components/Dialog";
import { IconSearch, IconStore } from "../../components/Icons";
import { Select } from "../../components/Select";
import { api, errorMessage } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { useAllBranches } from "./BranchProvider";
import { PRODUCTS_KEY, ProductThumb, weightLabel } from "./ProductsSection";
import {
  ProductDescription,
  ProductPhotos,
  ProductSpecs,
  photosFrom,
  photosPayload,
  specsFrom,
  specsIncomplete,
  specsPayload,
  type PhotoItem,
  type SpecDraft,
} from "./ProductContentFields";

const CATALOG_KEY = "admin-catalog";
const SKU = /^[A-Z0-9][A-Z0-9-]{1,39}$/;
const parseWeight = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(",", ".")));

type Availability = "sold" | "not_sold";

// Creates a SKU (product undefined) or edits one. Details apply to every branch.
function CatalogDialog({ product, categories, onClose }: { product?: CatalogProduct; categories: string[]; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [sku, setSku] = useState(product?.sku ?? "");
  const [name, setName] = useState(product?.name ?? "");
  const [unit, setUnit] = useState(product?.unit ?? "");
  const [category, setCategory] = useState(product?.category ?? "");
  const [weight, setWeight] = useState(product ? String(product.weight_kg).replace(".", ",") : "");
  const [photos, setPhotos] = useState<PhotoItem[]>(() => photosFrom(product));
  const [description, setDescription] = useState(product?.description ?? "");
  const [specs, setSpecs] = useState<SpecDraft[]>(() => specsFrom(product));

  const skuValue = sku.trim().toUpperCase();
  const weightKg = parseWeight(weight);
  const uploading = photos.some((p) => p.state === "uploading");
  const invalid =
    (!product && !SKU.test(skuValue)) ||
    !name.trim() ||
    !unit.trim() ||
    !category.trim() ||
    !(weightKg > 0) ||
    specsIncomplete(specs) ||
    photos.some((p) => p.state === "error");
  const imageKeys = photosPayload(photos);
  const specRows = specsPayload(specs);

  const changes: UpdateCatalogProduct = {};
  if (product) {
    if (name.trim() !== product.name) changes.name = name.trim();
    if (unit.trim() !== product.unit) changes.unit = unit.trim();
    if (category.trim().toLowerCase() !== product.category) changes.category = category.trim().toLowerCase();
    if (weightKg !== product.weight_kg) changes.weight_kg = weightKg;
    if (description.trim() !== product.description) changes.description = description.trim();
    if (JSON.stringify(specRows) !== JSON.stringify(product.specs)) changes.specs = specRows;
    if (JSON.stringify(imageKeys) !== JSON.stringify(product.images.map((i) => i.key))) changes.images = imageKeys;
  }
  const dirty = !product || Object.keys(changes).length > 0;
  const canSave = dirty && !invalid && !uploading;

  const save = useMutation({
    mutationFn: async () => {
      if (product) return (await api.patch<CatalogProduct>(`/admin/catalog/${product.id}`, changes)).data;
      const body: CreateCatalogProduct = {
        sku: skuValue,
        name: name.trim(),
        unit: unit.trim(),
        category,
        weight_kg: weightKg,
        description: description.trim(),
        specs: specRows,
        images: imageKeys,
      };
      return (await api.post<CatalogProduct>("/admin/catalog", body)).data;
    },
    onSuccess: (p) => {
      toast("success", product ? `${p.name} disimpan untuk semua cabang` : `SKU ${p.sku} dibuat. Cabang bisa menambahkannya lewat Tambah produk.`);
      onClose();
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: [CATALOG_KEY] });
      void queryClient.invalidateQueries({ queryKey: [PRODUCTS_KEY] });
    },
  });
  const busy = save.isPending;

  return (
    <Dialog title={product ? `Ubah ${product.name}` : "SKU baru"} wide>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) save.mutate();
        }}
      >
        {product ? (
          <p className="notice">
            Berlaku di semua cabang yang menjual produk ini
            {product.branches.length > 0 ? ` (${product.branches.length} cabang)` : ""}. SKU {product.sku} tidak bisa diganti.
          </p>
        ) : (
          <label className="field-label flex flex-col gap-1.5">
            SKU
            <input
              className="field uppercase tabular-nums"
              value={sku}
              maxLength={40}
              autoComplete="off"
              onChange={(e) => setSku(e.target.value.replace(/\s/g, ""))}
              disabled={busy}
              aria-invalid={sku !== "" && !SKU.test(skuValue)}
              aria-describedby="sku-help"
              autoFocus
            />
            <span id="sku-help" className="text-sm font-normal">
              Huruf, angka dan tanda minus, misalnya MYK-2L. Tidak bisa diganti setelah dibuat.
            </span>
          </label>
        )}
        <label className="field-label flex flex-col gap-1.5">
          Nama
          <input className="field" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} disabled={busy} />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="field-label flex flex-col gap-1.5">
            Satuan
            <input className="field" value={unit} maxLength={30} onChange={(e) => setUnit(e.target.value)} disabled={busy} />
          </label>
          <label className="field-label flex flex-col gap-1.5">
            Kategori
            <input
              className="field"
              list="catalog-categories"
              value={category}
              maxLength={40}
              onChange={(e) => setCategory(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="field-label flex flex-col gap-1.5">
            Berat (kg)
            <input
              className="field tabular-nums"
              inputMode="decimal"
              value={weight}
              maxLength={8}
              onChange={(e) => setWeight(e.target.value.replace(/[^\d.,]/g, ""))}
              disabled={busy}
              aria-invalid={weight !== "" && !(weightKg > 0)}
            />
          </label>
        </div>
        <p className="-mt-2 text-sm text-muted-foreground">Berat dipakai untuk menghitung ongkir dan batas berat pesanan.</p>
        <datalist id="catalog-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <section className="flex flex-col gap-5 border-t border-border pt-4" aria-labelledby="product-page-heading">
          <div>
            <h3 id="product-page-heading" className="font-bold">
              Halaman produk
            </h3>
            <p className="text-sm text-muted-foreground">Yang dilihat pelanggan saat membuka produk ini, sama di semua cabang.</p>
          </div>
          <ProductPhotos photos={photos} onChange={setPhotos} disabled={busy} />
          <ProductDescription value={description} onChange={setDescription} disabled={busy} />
          <ProductSpecs rows={specs} onChange={setSpecs} disabled={busy} />
        </section>
        {save.isError && (
          <p className="alert-box" role="alert">
            {errorMessage(save.error)}
          </p>
        )}
        <div className="dialog-footer">
          {uploading && (
            <p className="mr-auto self-center text-sm text-muted-foreground" role="status">
              Menunggu foto selesai diunggah…
            </p>
          )}
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Batal
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !canSave}>
            {busy ? "Menyimpan…" : product ? "Simpan" : "Buat SKU"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function CatalogSection() {
  const branches = useAllBranches();
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const [filterBranch, setFilterBranch] = useState("");
  const [availability, setAvailability] = useState<Availability>("sold");
  const [open, setOpen] = useState<{ dialog: "edit"; id: string } | { dialog: "new" } | null>(null);

  const catalog = useInfiniteQuery({
    queryKey: [CATALOG_KEY, q, filterBranch, availability],
    queryFn: async ({ pageParam }) =>
      (
        await api.get<CatalogResponse>("/admin/catalog", {
          params: {
            q: q || undefined,
            filter_branch_id: filterBranch || undefined,
            availability: filterBranch ? availability : undefined,
            page: pageParam,
          },
        })
      ).data,
    initialPageParam: 1,
    getNextPageParam: (last) => (last.has_more ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });
  const rows = catalog.data?.pages.flatMap((p) => p.products) ?? [];
  const categories = catalog.data?.pages[0]?.categories ?? [];
  const editing = open?.dialog === "edit" ? rows.find((p) => p.id === open.id) : undefined;
  const branchName = branches.data?.find((b) => b.id === filterBranch)?.name;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative w-full lg:max-w-sm">
          <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lg text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama atau SKU…"
            aria-label="Cari katalog"
            className="field pl-10"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex">
          <Select
            label="Filter cabang"
            icon={<IconStore />}
            className="lg:w-56"
            active={filterBranch !== ""}
            value={filterBranch}
            onChange={setFilterBranch}
            options={[
              { value: "", label: "Semua cabang" },
              ...(branches.data ?? []).map((b) => ({ value: b.id, label: b.name, hint: `${b.product_count} produk` })),
            ]}
          />
          {filterBranch && (
            <Select<Availability>
              label="Status di cabang"
              className="lg:w-52"
              value={availability}
              onChange={setAvailability}
              options={[
                { value: "sold", label: "Dijual di cabang ini" },
                { value: "not_sold", label: "Belum dijual" },
              ]}
            />
          )}
        </div>
        <button className="btn btn-primary self-start lg:ml-auto lg:self-auto" onClick={() => setOpen({ dialog: "new" })}>
          SKU baru
        </button>
      </div>

      {catalog.isLoading && (
        <div className="space-y-3" role="status" aria-busy="true" aria-label="Memuat">
          <div className="skeleton h-14" />
          <div className="skeleton h-14" />
          <div className="skeleton h-14" />
        </div>
      )}
      {catalog.isError && (
        <p className="alert-box" role="alert">
          {errorMessage(catalog.error)}
        </p>
      )}
      {catalog.isSuccess && rows.length === 0 && (
        <div className="empty-state">
          <p>
            {q
              ? `Tidak ada SKU yang cocok dengan “${q}”.`
              : filterBranch
                ? availability === "sold"
                  ? `${branchName ?? "Cabang ini"} belum menjual produk apa pun.`
                  : `${branchName ?? "Cabang ini"} sudah menjual semua SKU di katalog.`
                : "Katalog masih kosong. Buat SKU pertama dengan SKU baru."}
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
                <th className="text-right">Berat</th>
                <th>Dijual di</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td data-primary>
                    <span className="flex items-center gap-3">
                      <ProductThumb src={p.images[0]?.url ?? null} />
                      <span className="min-w-0">
                        <span className="block font-bold">{p.name}</span>
                        <span className="t-label mt-0.5 block tabular-nums">
                          {p.sku} · {p.unit}
                          {p.images.length === 0 && " · belum ada foto"}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td data-label="Kategori" className="capitalize">
                    {p.category}
                  </td>
                  <td data-label="Berat" className="tabular-nums md:text-right">
                    {weightLabel(p.weight_kg)}
                  </td>
                  <td data-label="Dijual di" className="max-w-xs">
                    {p.branches.length === 0 ? (
                      <span className="text-muted-foreground">Belum ada cabang</span>
                    ) : (
                      <span title={p.branches.map((b) => b.name).join(", ")}>
                        {p.branches.length <= 2
                          ? p.branches.map((b) => b.name).join(", ")
                          : `${p.branches[0]!.name} +${p.branches.length - 1} cabang`}
                      </span>
                    )}
                  </td>
                  <td data-actions className="md:text-right">
                    <button className="btn btn-secondary btn-sm" onClick={() => setOpen({ dialog: "edit", id: p.id })}>
                      Ubah
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {catalog.hasNextPage && (
        <button className="btn btn-secondary self-center" onClick={() => void catalog.fetchNextPage()} disabled={catalog.isFetchingNextPage}>
          {catalog.isFetchingNextPage ? "Memuat…" : "Muat lagi"}
        </button>
      )}
      {open?.dialog === "new" && <CatalogDialog categories={categories} onClose={() => setOpen(null)} />}
      {editing && <CatalogDialog product={editing} categories={categories} onClose={() => setOpen(null)} />}
    </div>
  );
}
