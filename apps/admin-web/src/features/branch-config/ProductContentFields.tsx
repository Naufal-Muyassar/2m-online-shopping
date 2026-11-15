import { useId, useRef, useState } from "react";
import axios from "axios";
import {
  PRODUCT_DESCRIPTION_MAX,
  PRODUCT_IMAGES_MAX,
  PRODUCT_SPECS_MAX,
  type CatalogImageUploadResponse,
  type CatalogProduct,
  type ProductSpec,
} from "@2m/shared";
import { IconChevronLeft, IconChevronRight, IconImage, IconPlus, IconTrash } from "../../components/Icons";
import { api, errorMessage } from "../../lib/api";
import { compressImage } from "../../lib/image";
import { cn } from "../../lib/utils";

export interface PhotoItem {
  id: string;
  // Set once the upload has finished; only these are saved.
  key?: string;
  src: string;
  state: "ready" | "uploading" | "error";
  message?: string;
}

export interface SpecDraft {
  id: string;
  label: string;
  value: string;
}

const uid = () => crypto.randomUUID();

export const photosFrom = (p?: CatalogProduct): PhotoItem[] =>
  (p?.images ?? []).map((i) => ({ id: i.key, key: i.key, src: i.url, state: "ready" }));
export const specsFrom = (p?: CatalogProduct): SpecDraft[] => (p?.specs ?? []).map((s) => ({ id: uid(), ...s }));

// Complete rows only; a row with just one side filled is reported by specsIncomplete.
export const specsPayload = (rows: SpecDraft[]): ProductSpec[] =>
  rows.map((r) => ({ label: r.label.trim(), value: r.value.trim() })).filter((r) => r.label && r.value);
export const specsIncomplete = (rows: SpecDraft[]) => rows.some((r) => !r.label.trim() !== !r.value.trim());
export const photosPayload = (photos: PhotoItem[]): string[] => photos.flatMap((p) => (p.state === "ready" && p.key ? [p.key] : []));

const SPEC_SUGGESTIONS = ["Merek", "Asal", "Kemasan", "Isi bersih", "Masa simpan", "Komposisi", "Sertifikat halal", "Penyimpanan"];

async function uploadPhoto(file: File): Promise<CatalogImageUploadResponse> {
  const blob = await compressImage(file);
  const target = (await api.post<CatalogImageUploadResponse>("/admin/catalog/image-upload-url")).data;
  try {
    await axios.put(target.upload_url, blob, { headers: { "Content-Type": "image/jpeg" } });
  } catch {
    throw new Error("Unggah gagal. Periksa koneksi lalu coba lagi.");
  }
  return target;
}

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

// Photos in display order; the first is the cover on product cards. Pick a tile, then act on it below.
export function ProductPhotos({
  photos,
  onChange,
  disabled,
}: {
  photos: PhotoItem[];
  onChange: (update: (prev: PhotoItem[]) => PhotoItem[]) => void;
  disabled: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const helpId = useId();
  const index = photos.findIndex((p) => p.id === selectedId);
  const selected = index >= 0 ? photos[index] : undefined;
  const full = photos.length >= PRODUCT_IMAGES_MAX;

  function addFiles(files: FileList | null) {
    if (!files) return;
    const room = PRODUCT_IMAGES_MAX - photos.length;
    const picked = Array.from(files).slice(0, room);
    const items = picked.map((file) => ({ file, item: { id: uid(), src: URL.createObjectURL(file), state: "uploading" } as PhotoItem }));
    onChange((prev) => [...prev, ...items.map((i) => i.item)]);
    for (const { file, item } of items) {
      uploadPhoto(file).then(
        (res) => {
          URL.revokeObjectURL(item.src);
          onChange((prev) => prev.map((p) => (p.id === item.id ? { ...p, key: res.key, src: res.url, state: "ready" } : p)));
        },
        (err: unknown) =>
          onChange((prev) => prev.map((p) => (p.id === item.id ? { ...p, state: "error", message: errorMessage(err) } : p))),
      );
    }
  }

  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <div className="flex items-baseline justify-between gap-3">
        <legend className="field-label">Foto produk</legend>
        <span className="t-label tabular-nums">
          {photos.length}/{PRODUCT_IMAGES_MAX}
        </span>
      </div>
      <p id={helpId} className="-mt-2 text-sm text-muted-foreground">
        Foto pertama jadi sampul di kartu produk. Pilih foto untuk menggeser, menjadikan sampul, atau menghapusnya.
      </p>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((p, i) => (
          <li key={p.id}>
            <button
              type="button"
              className="photo-tile"
              aria-pressed={p.id === selectedId}
              aria-label={`Foto ${i + 1}${i === 0 ? ", sampul" : ""}${p.state === "uploading" ? ", sedang diunggah" : p.state === "error" ? ", gagal diunggah" : ""}`}
              onClick={() => setSelectedId(p.id === selectedId ? null : p.id)}
            >
              <img src={p.src} alt="" loading="lazy" />
              {i === 0 && p.state === "ready" && <span className="pill pill-primary photo-tile-badge">Sampul</span>}
              {p.state === "uploading" && (
                <span className="photo-tile-state" role="status">
                  Mengunggah…
                </span>
              )}
              {p.state === "error" && (
                <span className="photo-tile-state" data-error>
                  Gagal
                </span>
              )}
            </button>
          </li>
        ))}
        {!full && (
          <li>
            <label className="photo-add" aria-disabled={disabled}>
              <IconImage className="text-2xl" aria-hidden="true" />
              Tambah foto
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                aria-describedby={helpId}
                disabled={disabled}
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </li>
        )}
      </ul>
      {selected && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3" role="group" aria-label={`Foto ${index + 1}`}>
          {selected.state === "error" && (
            <p className="w-full text-sm text-destructive" role="alert">
              {selected.message ?? "Foto gagal diunggah."} Hapus lalu pilih lagi.
            </p>
          )}
          <button
            type="button"
            className="icon-btn"
            aria-label="Geser ke kiri"
            disabled={index === 0}
            onClick={() => onChange((prev) => move(prev, index, index - 1))}
          >
            <IconChevronLeft />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Geser ke kanan"
            disabled={index === photos.length - 1}
            onClick={() => onChange((prev) => move(prev, index, index + 1))}
          >
            <IconChevronRight />
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={index === 0 || selected.state !== "ready"}
            onClick={() => onChange((prev) => move(prev, index, 0))}
          >
            Jadikan sampul
          </button>
          <button
            type="button"
            className="btn btn-danger-quiet btn-sm ml-auto"
            onClick={() => {
              onChange((prev) => prev.filter((p) => p.id !== selected.id));
              setSelectedId(null);
            }}
          >
            <IconTrash aria-hidden="true" /> Hapus
          </button>
        </div>
      )}
    </fieldset>
  );
}

export function ProductDescription({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="field-label flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-3">
        Deskripsi
        <span className={cn("t-label tabular-nums", value.length > PRODUCT_DESCRIPTION_MAX * 0.9 && "text-warning")}>
          {value.length}/{PRODUCT_DESCRIPTION_MAX}
        </span>
      </span>
      <textarea
        className="field min-h-32 resize-y leading-relaxed"
        value={value}
        maxLength={PRODUCT_DESCRIPTION_MAX}
        placeholder="Ceritakan produknya: rasa, kegunaan, cara simpan."
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </label>
  );
}

// Label and value pairs in display order, for example "Merek: Bimoli".
export function ProductSpecs({
  rows,
  onChange,
  disabled,
}: {
  rows: SpecDraft[];
  onChange: (rows: SpecDraft[]) => void;
  disabled: boolean;
}) {
  const listId = useId();
  const update = (id: string, patch: Partial<SpecDraft>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <fieldset className="flex flex-col gap-3" disabled={disabled}>
      <div className="flex items-baseline justify-between gap-3">
        <legend className="field-label">Spesifikasi</legend>
        <span className="t-label tabular-nums">
          {rows.length}/{PRODUCT_SPECS_MAX}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="-mt-2 text-sm text-muted-foreground">Belum ada. Tambahkan detail seperti merek, asal atau masa simpan.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r, i) => {
            const half = !r.label.trim() !== !r.value.trim();
            return (
              <li key={r.id} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] gap-2">
                <input
                  className="field"
                  value={r.label}
                  maxLength={40}
                  list={listId}
                  placeholder="Label"
                  aria-label={`Label baris ${i + 1}`}
                  aria-invalid={half && !r.label.trim()}
                  onChange={(e) => update(r.id, { label: e.target.value })}
                />
                <input
                  className="field"
                  value={r.value}
                  maxLength={200}
                  placeholder="Nilai"
                  aria-label={`Nilai baris ${i + 1}`}
                  aria-invalid={half && !r.value.trim()}
                  onChange={(e) => update(r.id, { value: e.target.value })}
                />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Hapus baris ${i + 1}`}
                  onClick={() => onChange(rows.filter((x) => x.id !== r.id))}
                >
                  <IconTrash />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <datalist id={listId}>
        {SPEC_SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {specsIncomplete(rows) && <p className="text-sm text-destructive">Isi label dan nilai di setiap baris, atau hapus barisnya.</p>}
      <button
        type="button"
        className="btn btn-secondary btn-sm self-start"
        disabled={rows.length >= PRODUCT_SPECS_MAX}
        onClick={() => onChange([...rows, { id: uid(), label: "", value: "" }])}
      >
        <IconPlus aria-hidden="true" /> Tambah baris
      </button>
    </fieldset>
  );
}
