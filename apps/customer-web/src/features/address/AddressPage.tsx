import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import type { Address, AddressInput } from "@2m/shared";
import { errorMessage } from "../../lib/api";
import { useCheckout } from "../../lib/checkout";
import { useAddressMutations, useAddresses, useBranches } from "../../lib/queries";
import { useToast } from "../../lib/toast";
import { cn } from "../../lib/utils";
import { IconPin } from "../../components/Icons";
import { btnPrimary, btnSecondary, EmptyState, PageSkeleton, rise } from "../../components/States";
import { MapPicker, type LatLng } from "./MapPicker";

const field = "field";

interface FormState {
  label: string;
  street: string;
  rt_rw: string;
  unit: string;
  receiver_name: string;
  receiver_phone: string;
  courier_note: string;
}

const EMPTY: FormState = { label: "Rumah", street: "", rt_rw: "", unit: "", receiver_name: "", receiver_phone: "", courier_note: "" };

function AddressForm({
  branch,
  editing,
  onDone,
}: {
  branch: { id: string; lat: number; lng: number; service_radius_m: number };
  editing: Address | null;
  onDone: (saved?: Address) => void;
}) {
  const toast = useToast();
  const { create, update } = useAddressMutations();
  const [form, setForm] = useState<FormState>(
    editing
      ? {
          label: editing.label,
          street: editing.street,
          rt_rw: editing.rt_rw ?? "",
          unit: editing.unit ?? "",
          receiver_name: editing.receiver_name,
          receiver_phone: editing.receiver_phone,
          courier_note: editing.courier_note ?? "",
        }
      : EMPTY,
  );
  const [pin, setPin] = useState<LatLng | null>(editing ? { lat: editing.lat, lng: editing.lng } : null);
  const [error, setError] = useState<string | null>(null);
  const pending = create.isPending || update.isPending;
  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  function locateMe() {
    navigator.geolocation?.getCurrentPosition(
      (p) => setPin({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => toast("error", "Tidak bisa mengambil lokasi. Pilih titik di peta."),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!pin) {
      setError("Tandai lokasi pengantaran di peta.");
      return;
    }
    setError(null);
    const input: AddressInput = { ...form, branch_id: branch.id, lat: pin.lat, lng: pin.lng };
    const opts = { onSuccess: (saved: Address) => onDone(saved), onError: (err: unknown) => setError(errorMessage(err)) };
    if (editing) update.mutate({ id: editing.id, input }, opts);
    else create.mutate(input, opts);
  }

  return (
    <form onSubmit={onSubmit} className="card animate-rise space-y-3">
      <h2 className="text-lg font-bold">{editing ? "Ubah alamat" : "Alamat baru"}</h2>
      <MapPicker branch={{ lat: branch.lat, lng: branch.lng, radiusM: branch.service_radius_m }} value={pin} onChange={setPin} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{pin ? `Pin: ${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}` : "Ketuk peta untuk menaruh pin"}</span>
        <button type="button" onClick={locateMe} className={cn(btnSecondary, "px-4 text-sm")}>
          Lokasi saya
        </button>
      </div>
      <label className="block space-y-1">
        <span className="field-label">Label</span>
        <input className={field} value={form.label} onChange={set("label")} required maxLength={40} />
      </label>
      <label className="block space-y-1">
        <span className="field-label">Alamat lengkap</span>
        <textarea className={field} value={form.street} onChange={set("street")} required maxLength={300} rows={2} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="field-label">RT/RW</span>
          <input className={field} value={form.rt_rw} onChange={set("rt_rw")} maxLength={20} />
        </label>
        <label className="block space-y-1">
          <span className="field-label">Unit / No. rumah</span>
          <input className={field} value={form.unit} onChange={set("unit")} maxLength={60} />
        </label>
        <label className="block space-y-1">
          <span className="field-label">Nama penerima</span>
          <input className={field} value={form.receiver_name} onChange={set("receiver_name")} required maxLength={100} />
        </label>
        <label className="block space-y-1">
          <span className="field-label">No. HP penerima</span>
          <input className={field} value={form.receiver_phone} onChange={set("receiver_phone")} inputMode="tel" required />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="field-label">Catatan untuk kurir</span>
        <input className={field} value={form.courier_note} onChange={set("courier_note")} maxLength={300} />
      </label>
      {error && (
        <p role="alert" className="alert-box">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={cn(btnPrimary, "flex-1")}>
          {pending ? "Menyimpan…" : "Simpan"}
        </button>
        <button type="button" onClick={() => onDone()} className={cn(btnSecondary, "flex-1")}>
          Batal
        </button>
      </div>
    </form>
  );
}

export function AddressPage() {
  const { branchId = "" } = useParams();
  const toast = useToast();
  const { data: branches } = useBranches();
  const { data: addresses, isLoading } = useAddresses();
  const { remove } = useAddressMutations();
  const { addressId, setAddressId } = useCheckout();
  const [form, setForm] = useState<{ editing: Address | null } | null>(null);
  const branch = branches?.find((b) => b.id === branchId);

  if (!branch) return <PageSkeleton />;
  const selected = addresses?.find((a) => a.id === addressId) ?? null;

  return (
    <main className="app-main">
      <h1 className="text-2xl font-bold">Alamat pengantaran</h1>
      {isLoading && (
        <div className="space-y-3" aria-busy="true" aria-label="Memuat">
          <div className="skeleton h-24 rounded-lg" />
          <div className="skeleton h-24 rounded-lg" />
        </div>
      )}
      {form ? (
        <AddressForm
          branch={branch}
          editing={form.editing}
          onDone={(saved) => {
            if (saved) setAddressId(saved.id);
            setForm(null);
          }}
        />
      ) : (
        <>
          <ul className="space-y-3">
            {addresses?.map((a, i) => (
              <li
                key={a.id}
                className={cn("card animate-rise", selected?.id === a.id && "border-primary bg-primary-surface")}
                style={rise(i)}
              >
                <div className="flex items-start gap-1">
                  <label className="-ml-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center">
                    <input
                      type="radio"
                      name="address"
                      checked={selected?.id === a.id}
                      onChange={() => setAddressId(a.id)}
                      className="h-5 w-5 accent-primary"
                      aria-label={`Pilih ${a.label}`}
                    />
                  </label>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-bold">{a.label}</p>
                    <p>{a.street}</p>
                    <p className="text-muted-foreground">
                      {a.receiver_name} · {a.receiver_phone}
                    </p>
                  </div>
                </div>
                <div className="card-footer flex justify-end gap-2">
                  <button onClick={() => setForm({ editing: a })} className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-accent">
                    Ubah
                  </button>
                  <button
                    onClick={() =>
                      remove.mutate(a.id, {
                        onSuccess: () => selected?.id === a.id && setAddressId(null),
                        onError: (e) => toast("error", errorMessage(e)),
                      })
                    }
                    className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-destructive"
                  >
                    Hapus
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {addresses && addresses.length === 0 && (
            <EmptyState icon={<IconPin />} title="Belum ada alamat.">
              <p className="text-sm">Tambah alamat untuk melanjutkan.</p>
            </EmptyState>
          )}
          <button onClick={() => setForm({ editing: null })} className={cn(btnSecondary, "w-full border-dashed")}>
            + Tambah alamat
          </button>
          {selected ? (
            <Link to={`/b/${branchId}/checkout`} className="btn-hero w-full">
              Lanjut ke pembayaran
            </Link>
          ) : (
            <button disabled className="btn-hero w-full">
              Pilih alamat dulu
            </button>
          )}
        </>
      )}
    </main>
  );
}
