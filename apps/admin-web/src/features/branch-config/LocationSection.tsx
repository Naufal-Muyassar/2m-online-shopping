import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPicker } from "@2m/map";
import type { AdminBranch, AdminBranchUpdate } from "@2m/shared";
import { api, errorMessage } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { BRANCH_CONTEXT_KEY, useBranch } from "./BranchProvider";

const RADIUS_MIN_KM = 0.5;
const RADIUS_MAX_KM = 50;

export interface PointDraft {
  lat: string;
  lng: string;
}

// Typed with either decimal separator; six decimals is about 10 cm.
const parseNum = (s: string) => (s.trim() === "" ? NaN : Number(s.trim().replace(",", ".")));
const showCoord = (n: number) => String(Number(n.toFixed(6)));
export const pointDraft = (lat: number, lng: number): PointDraft => ({ lat: showCoord(lat), lng: showCoord(lng) });
export const radiusDraft = (m: number) => String(m / 1000).replace(".", ",");

export function parsePoint(p: PointDraft): { lat: number; lng: number } | null {
  const lat = parseNum(p.lat);
  const lng = parseNum(p.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

export function parseRadiusM(km: string): number | null {
  const m = Math.round(parseNum(km) * 1000);
  return Number.isFinite(m) && m >= RADIUS_MIN_KM * 1000 && m <= RADIUS_MAX_KM * 1000 ? m : null;
}

// The service circle follows the pin; clicking the map moves the branch.
export function LocationMap({
  point,
  radiusKm,
  onPoint,
  disabled,
  className,
}: {
  point: PointDraft;
  radiusKm: string;
  onPoint: (p: PointDraft) => void;
  disabled?: boolean;
  className: string;
}) {
  const value = parsePoint(point);
  const radiusM = parseRadiusM(radiusKm) ?? RADIUS_MIN_KM * 1000;
  return (
    <MapPicker
      value={value}
      area={value ? { ...value, radiusM } : null}
      onChange={(p) => !disabled && onPoint(pointDraft(p.lat, p.lng))}
      fitArea
      ariaLabel="Peta lokasi cabang. Klik untuk memindahkan titik cabang."
      className={className}
    />
  );
}

export function LocationInputs({
  point,
  radiusKm,
  onPoint,
  onRadius,
  disabled,
}: {
  point: PointDraft;
  radiusKm: string;
  onPoint: (p: PointDraft) => void;
  onRadius: (km: string) => void;
  disabled?: boolean;
}) {
  const badPoint = parsePoint(point) === null;
  const coord = (s: string) => s.replace(/[^\d.,-]/g, "");
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <label className="field-label flex flex-col gap-1.5">
          Latitude
          <input
            className="field tabular-nums"
            inputMode="decimal"
            autoComplete="off"
            value={point.lat}
            onChange={(e) => onPoint({ ...point, lat: coord(e.target.value) })}
            disabled={disabled}
            aria-invalid={badPoint}
          />
        </label>
        <label className="field-label flex flex-col gap-1.5">
          Longitude
          <input
            className="field tabular-nums"
            inputMode="decimal"
            autoComplete="off"
            value={point.lng}
            onChange={(e) => onPoint({ ...point, lng: coord(e.target.value) })}
            disabled={disabled}
            aria-invalid={badPoint}
          />
        </label>
      </div>
      <label className="field-label flex flex-col gap-1.5">
        Jangkauan antar (km)
        <input
          className="field tabular-nums"
          inputMode="decimal"
          autoComplete="off"
          value={radiusKm}
          maxLength={5}
          onChange={(e) => onRadius(e.target.value.replace(/[^\d.,]/g, ""))}
          disabled={disabled}
          aria-invalid={parseRadiusM(radiusKm) === null}
          aria-describedby="radius-help"
        />
      </label>
      <p id="radius-help" className="-mt-2 text-sm text-muted-foreground">
        {String(RADIUS_MIN_KM).replace(".", ",")}–{RADIUS_MAX_KM} km dari titik cabang. Alamat di luar lingkaran tidak bisa
        memesan.
      </p>
    </>
  );
}

function LocationForm({ branch }: { branch: AdminBranch }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(branch.name);
  const [point, setPoint] = useState(pointDraft(branch.lat, branch.lng));
  const [radiusKm, setRadiusKm] = useState(radiusDraft(branch.service_radius_m));

  const parsed = parsePoint(point);
  const radiusM = parseRadiusM(radiusKm);
  const changes: AdminBranchUpdate = {};
  if (name.trim() !== branch.name) changes.name = name.trim();
  if (parsed && (parsed.lat !== branch.lat || parsed.lng !== branch.lng)) Object.assign(changes, parsed);
  if (radiusM !== null && radiusM !== branch.service_radius_m) changes.service_radius_m = radiusM;
  const invalid = !name.trim() || !parsed || radiusM === null;
  const dirty = Object.keys(changes).length > 0;

  const save = useMutation({
    mutationFn: async () => (await api.patch<AdminBranch>("/admin/branch", { ...changes, branch_id: branch.id })).data,
    onSuccess: () => toast("success", "Lokasi cabang disimpan"),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-branch", branch.id] });
      void queryClient.invalidateQueries({ queryKey: [BRANCH_CONTEXT_KEY] });
    },
  });
  const busy = save.isPending;
  const reset = () => {
    setName(branch.name);
    setPoint(pointDraft(branch.lat, branch.lng));
    setRadiusKm(radiusDraft(branch.service_radius_m));
  };

  return (
    <form
      className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty && !invalid) save.mutate();
      }}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <LocationMap
          point={point}
          radiusKm={radiusKm}
          onPoint={setPoint}
          disabled={busy}
          className="isolate h-80 w-full overflow-hidden rounded-lg border border-border lg:h-[calc(100dvh-20rem)] lg:min-h-[24rem]"
        />
        <p className="text-sm text-muted-foreground">Klik peta untuk memindahkan titik cabang, atau isi koordinatnya.</p>
      </div>
      <div className="card flex flex-col gap-4 self-start">
        <label className="field-label flex flex-col gap-1.5">
          Nama cabang
          <input
            className="field"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            aria-invalid={!name.trim()}
          />
        </label>
        <LocationInputs point={point} radiusKm={radiusKm} onPoint={setPoint} onRadius={setRadiusKm} disabled={busy} />
        {save.isError && (
          <p className="alert-box" role="alert">
            {errorMessage(save.error)}
          </p>
        )}
        <p className="notice">Titik dan jangkauan baru langsung dipakai untuk ongkir dan cek alamat pesanan berikutnya.</p>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-secondary" disabled={busy || !dirty} onClick={reset}>
            Batalkan
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !dirty || invalid}>
            {busy ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </div>
    </form>
  );
}

export function LocationSection() {
  const { branchId } = useBranch();
  const branch = useQuery({
    queryKey: ["admin-branch", branchId],
    queryFn: async () => (await api.get<AdminBranch>("/admin/branch", { params: { branch_id: branchId } })).data,
  });

  if (branch.isLoading)
    return (
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]" role="status" aria-busy="true" aria-label="Memuat">
        <div className="skeleton h-96" />
        <div className="skeleton h-96" />
      </div>
    );
  if (branch.isError || !branch.data)
    return (
      <p className="alert-box" role="alert">
        {errorMessage(branch.error)}
      </p>
    );
  // Keyed by the saved values, so after a save the form restarts from what the server now holds.
  const b = branch.data;
  return <LocationForm key={`${b.name}|${b.lat}|${b.lng}|${b.service_radius_m}`} branch={b} />;
}
