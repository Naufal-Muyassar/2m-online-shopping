import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { destinationPoint, formatIDR, haversineKm, type Address, type AddressInput, type CalculatePriceRequest } from "@2m/shared";
import { errorMessage, OUTSIDE_COVERAGE_MESSAGE } from "../../lib/api";
import { useCheckout } from "../../lib/checkout";
import { useAddressMutations, useAddresses, useBranches, useCart, useQuote } from "../../lib/queries";
import { useToast } from "../../lib/toast";
import { cn } from "../../lib/utils";
import { IconArrowRight, IconPin } from "../../components/Icons";
import { EmptyState, PageSkeleton, rise } from "../../components/States";
import { MapPicker, type LatLng } from "./MapPicker";

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
const DEMO_POINTS = [
  { label: "Dekat ±0,8 km", km: 0.8 },
  { label: "Sedang ±2 km", km: 2 },
  { label: "Jauh ±4 km", km: 4 },
] as const;
const DEMO_BEARING_DEG = 45;

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

const fieldGroup = "flex flex-col gap-1.5";

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
  const [demoAddressId, setDemoAddressId] = useState<string | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const qc = useQueryClient();
  const { paymentMethod } = useCheckout();
  const { data: cart } = useCart(branch.id, DEMO_MODE);
  const pending = create.isPending || update.isPending;
  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const outside = pin !== null && haversineKm(branch, pin) * 1000 > branch.service_radius_m;

  const quoteReq =
    demoAddressId && cart && cart.items.length > 0
      ? { branch_id: branch.id, address_id: demoAddressId, payment_method: paymentMethod as CalculatePriceRequest["payment_method"] }
      : null;
  const quote = useQuote(quoteReq);

  // A demo chip saves one reusable "Titik demo" address so the server can price the pin.
  async function pickDemoPoint(km: number) {
    const point = destinationPoint(branch, DEMO_BEARING_DEG, km);
    setPin(point);
    setError(null);
    setDemoBusy(true);
    const input: AddressInput = {
      branch_id: branch.id,
      label: "Titik demo",
      lat: point.lat,
      lng: point.lng,
      street: "Titik demo (simulasi)",
      receiver_name: "Demo",
      receiver_phone: "081200000000",
    };
    try {
      const saved = demoAddressId
        ? await update.mutateAsync({ id: demoAddressId, input })
        : await create.mutateAsync(input);
      setDemoAddressId(saved.id);
      await qc.invalidateQueries({ queryKey: ["quote"] });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDemoBusy(false);
    }
  }

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
    if (outside) return;
    setError(null);
    const input: AddressInput = { ...form, branch_id: branch.id, lat: pin.lat, lng: pin.lng };
    const opts = { onSuccess: (saved: Address) => onDone(saved), onError: (err: unknown) => setError(errorMessage(err)) };
    const targetId = editing?.id ?? demoAddressId;
    if (targetId) update.mutate({ id: targetId, input }, opts);
    else create.mutate(input, opts);
  }

  const b = quote.data;
  return (
    <form onSubmit={onSubmit} className="flex animate-rise flex-col gap-5">
      <div className="section-head">
        <h2 className="t-title">{editing ? "Ubah alamat" : "Alamat baru"}</h2>
      </div>
      <div className="grid gap-5 lg:grid-cols-2 lg:gap-8">
        <div className="flex min-w-0 flex-col gap-3">
          {DEMO_MODE && !editing && (
            <div className="space-y-2" aria-live="polite">
              <div className="flex flex-wrap gap-2">
                {DEMO_POINTS.map((d) => {
                  const out = haversineKm(branch, destinationPoint(branch, DEMO_BEARING_DEG, d.km)) * 1000 > branch.service_radius_m;
                  return (
                    <button key={d.km} type="button" disabled={out || demoBusy} onClick={() => void pickDemoPoint(d.km)} className="btn btn-secondary flex-col gap-0 text-sm">
                      {d.label}
                      {out && <span className="block text-xs font-medium">di luar radius</span>}
                    </button>
                  );
                })}
              </div>
              {demoBusy || quote.isFetching ? (
                <p className="t-label">Menghitung harga…</p>
              ) : quote.isError ? (
                <p className="alert-box">{errorMessage(quote.error)}</p>
              ) : b ? (
                <p className="t-label">
                  Ongkir (±{b.route_distance_km} km): <strong className="text-foreground">{formatIDR(b.final_shipping_cost)}</strong>
                </p>
              ) : demoAddressId ? (
                <p className="t-label">Isi keranjang untuk melihat ongkir.</p>
              ) : null}
            </div>
          )}
          <MapPicker branch={{ lat: branch.lat, lng: branch.lng, radiusM: branch.service_radius_m }} value={pin} onChange={setPin} />
          {outside && (
            <p role="alert" className="alert-box">
              {OUTSIDE_COVERAGE_MESSAGE}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="t-label tabular-nums">{pin ? `Pin: ${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}` : "Ketuk peta untuk menaruh pin"}</span>
            <button type="button" onClick={locateMe} className="btn btn-secondary text-sm">
              <IconPin /> Lokasi saya
            </button>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <label className={fieldGroup}>
            <span className="field-label">Label</span>
            <input className="field" value={form.label} onChange={set("label")} required maxLength={40} />
          </label>
          <label className={fieldGroup}>
            <span className="field-label">Alamat lengkap</span>
            <textarea className="field" value={form.street} onChange={set("street")} required maxLength={300} rows={2} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={fieldGroup}>
              <span className="field-label">RT/RW</span>
              <input className="field" value={form.rt_rw} onChange={set("rt_rw")} maxLength={20} />
            </label>
            <label className={fieldGroup}>
              <span className="field-label">Unit / No. rumah</span>
              <input className="field" value={form.unit} onChange={set("unit")} maxLength={60} />
            </label>
            <label className={fieldGroup}>
              <span className="field-label">Nama penerima</span>
              <input className="field" value={form.receiver_name} onChange={set("receiver_name")} required maxLength={100} />
            </label>
            <label className={fieldGroup}>
              <span className="field-label">No. HP penerima</span>
              <input className="field" value={form.receiver_phone} onChange={set("receiver_phone")} inputMode="tel" required />
            </label>
          </div>
          <label className={fieldGroup}>
            <span className="field-label">Catatan untuk kurir</span>
            <input className="field" value={form.courier_note} onChange={set("courier_note")} maxLength={300} />
          </label>
          {error && (
            <p role="alert" className="alert-box">
              {error}
            </p>
          )}
          <div className="mt-auto flex gap-2 pt-1">
            <button type="submit" disabled={pending} className="btn btn-primary btn-lg flex-1">
              {pending ? "Menyimpan…" : "Simpan"}
            </button>
            <button type="button" onClick={() => onDone()} className="btn btn-secondary btn-lg flex-1">
              Batal
            </button>
          </div>
        </div>
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
      <h1 className="t-headline">Alamat pengantaran</h1>
      {isLoading && (
        <div className="page-narrow space-y-3" aria-busy="true" aria-label="Memuat">
          <div className="skeleton h-24" />
          <div className="skeleton h-24" />
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
        <div className="page-narrow flex flex-col gap-4">
          {addresses && addresses.length > 0 && (
            <ul className="list">
              {addresses.map((a, i) => (
                <li
                  key={a.id}
                  className={cn("flex animate-rise flex-wrap items-start gap-x-2 gap-y-1 p-3 transition-colors duration-200 sm:flex-nowrap sm:p-4", selected?.id === a.id && "bg-primary-surface/60")}
                  style={rise(i)}
                >
                  <label className="-m-1.5 flex size-11 shrink-0 cursor-pointer items-center justify-center">
                    <input
                      type="radio"
                      name="address"
                      checked={selected?.id === a.id}
                      onChange={() => setAddressId(a.id)}
                      className="size-5 accent-primary"
                      aria-label={`Pilih ${a.label}`}
                    />
                  </label>
                  <div className="min-w-0 flex-1 basis-[calc(100%-3.5rem)] pt-1 text-sm sm:basis-0">
                    <p className="text-base font-extrabold tracking-tight">{a.label}</p>
                    <p className="mt-1">{a.street}</p>
                    <p className="mt-0.5 text-muted-foreground">
                      {a.receiver_name} · {a.receiver_phone}
                    </p>
                  </div>
                  <div className="ml-11 flex shrink-0 gap-4 sm:ml-0">
                    <button onClick={() => setForm({ editing: a })} className="link text-sm">
                      Ubah
                    </button>
                    <button
                      onClick={() =>
                        remove.mutate(a.id, {
                          onSuccess: () => selected?.id === a.id && setAddressId(null),
                          onError: (e) => toast("error", errorMessage(e)),
                        })
                      }
                      className="link link-danger text-sm"
                    >
                      Hapus
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {addresses && addresses.length === 0 && (
            <EmptyState icon={<IconPin />} title="Belum ada alamat.">
              <p className="text-sm">Tambah alamat untuk melanjutkan.</p>
            </EmptyState>
          )}
          <button onClick={() => setForm({ editing: null })} className="btn btn-secondary btn-block border-dashed">
            + Tambah alamat
          </button>
          {selected ? (
            <Link to={`/b/${branchId}/checkout`} className="btn btn-primary btn-lg btn-block group">
              Lanjut ke pembayaran
              <IconArrowRight className="transition-transform duration-200 ease-settle group-hover:translate-x-0.5" />
            </Link>
          ) : (
            <button disabled className="btn btn-primary btn-lg btn-block">
              Pilih alamat dulu
            </button>
          )}
        </div>
      )}
    </main>
  );
}
