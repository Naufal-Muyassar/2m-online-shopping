import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import type { Address, AddressInput } from "@2m/shared";
import { errorMessage } from "../../lib/api";
import { useCheckout } from "../../lib/checkout";
import { useAddressMutations, useAddresses, useBranches } from "../../lib/queries";
import { useToast } from "../../lib/toast";
import { MapPicker, type LatLng } from "./MapPicker";

const field = "mt-1 w-full rounded-md border px-3 py-2";

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
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border p-4">
      <h2 className="font-medium">{editing ? "Ubah alamat" : "Alamat baru"}</h2>
      <MapPicker branch={{ lat: branch.lat, lng: branch.lng, radiusM: branch.service_radius_m }} value={pin} onChange={setPin} />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{pin ? `Pin: ${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}` : "Ketuk peta untuk menaruh pin"}</span>
        <button type="button" onClick={locateMe} className="rounded-md border px-2 py-1 text-foreground">
          Lokasi saya
        </button>
      </div>
      <label className="block text-sm">
        Label
        <input className={field} value={form.label} onChange={set("label")} required maxLength={40} />
      </label>
      <label className="block text-sm">
        Alamat lengkap
        <textarea className={field} value={form.street} onChange={set("street")} required maxLength={300} rows={2} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          RT/RW
          <input className={field} value={form.rt_rw} onChange={set("rt_rw")} maxLength={20} />
        </label>
        <label className="block text-sm">
          Unit / No. rumah
          <input className={field} value={form.unit} onChange={set("unit")} maxLength={60} />
        </label>
        <label className="block text-sm">
          Nama penerima
          <input className={field} value={form.receiver_name} onChange={set("receiver_name")} required maxLength={100} />
        </label>
        <label className="block text-sm">
          No. HP penerima
          <input className={field} value={form.receiver_phone} onChange={set("receiver_phone")} inputMode="tel" required />
        </label>
      </div>
      <label className="block text-sm">
        Catatan untuk kurir
        <input className={field} value={form.courier_note} onChange={set("courier_note")} maxLength={300} />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-60">
          {pending ? "Menyimpan…" : "Simpan"}
        </button>
        <button type="button" onClick={() => onDone()} className="rounded-md border px-4 py-2">
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

  if (!branch) return <p className="p-4 text-sm text-muted-foreground">Memuat…</p>;
  const selected = addresses?.find((a) => a.id === addressId) ?? null;

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-xl font-semibold">Alamat pengantaran</h1>
      {isLoading && <p className="text-sm text-muted-foreground">Memuat…</p>}
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
          <ul className="space-y-2">
            {addresses?.map((a) => (
              <li key={a.id} className="flex items-start gap-3 rounded-lg border p-3">
                <input
                  type="radio"
                  name="address"
                  checked={selected?.id === a.id}
                  onChange={() => setAddressId(a.id)}
                  className="mt-1"
                  aria-label={`Pilih ${a.label}`}
                />
                <div className="flex-1 text-sm">
                  <p className="font-medium">{a.label}</p>
                  <p>{a.street}</p>
                  <p className="text-muted-foreground">
                    {a.receiver_name} · {a.receiver_phone}
                  </p>
                </div>
                <button onClick={() => setForm({ editing: a })} className="text-sm text-primary">
                  Ubah
                </button>
                <button
                  onClick={() =>
                    remove.mutate(a.id, {
                      onSuccess: () => selected?.id === a.id && setAddressId(null),
                      onError: (e) => toast("error", errorMessage(e)),
                    })
                  }
                  className="text-sm text-destructive"
                >
                  Hapus
                </button>
              </li>
            ))}
          </ul>
          <button onClick={() => setForm({ editing: null })} className="w-full rounded-md border px-3 py-2">
            + Tambah alamat
          </button>
          {selected ? (
            <Link to={`/b/${branchId}/checkout`} className="block rounded-md bg-primary px-3 py-2 text-center text-primary-foreground">
              Lanjut ke pembayaran
            </Link>
          ) : (
            <button disabled className="w-full rounded-md bg-primary px-3 py-2 text-primary-foreground opacity-50">
              Pilih alamat dulu
            </button>
          )}
        </>
      )}
    </main>
  );
}
