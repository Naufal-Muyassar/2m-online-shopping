import { useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminCourier,
  CourierPartnersResponse,
  CourierReleasesResponse,
  CreateCourierRequest,
  CreateCourierResponse,
} from "@2m/shared";
import { Dialog } from "../../components/Dialog";
import { IconTruck } from "../../components/Icons";
import { Select } from "../../components/Select";
import { api, errorMessage } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { useBranch } from "../branch-config/BranchProvider";

const PHONE = /^\+?[0-9]{8,16}$/;

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function usePartners() {
  return useQuery({
    queryKey: ["admin-courier-partners"],
    staleTime: 5 * 60_000,
    queryFn: async () => (await api.get<CourierPartnersResponse>("/admin/courier-partners")).data.partners,
  });
}

export function NewCourierDialog({ onClose }: { onClose: () => void }) {
  const { branchId } = useBranch();
  const toast = useToast();
  const queryClient = useQueryClient();
  const partners = usePartners();
  const [draft, setDraft] = useState({ name: "", phone: "", password: "", partner_id: "" });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const partnerId = draft.partner_id || partners.data?.[0]?.id || "";
  const errors = {
    name: !draft.name.trim(),
    phone: !PHONE.test(draft.phone.trim()),
    password: draft.password.length < 8,
  };
  const invalid = Object.values(errors).some(Boolean) || !partnerId;

  const create = useMutation({
    mutationFn: async () => {
      const body: CreateCourierRequest = {
        branch_id: branchId ?? undefined,
        name: draft.name.trim(),
        phone: draft.phone.trim(),
        password: draft.password,
        partner_id: partnerId,
      };
      return (await api.post<CreateCourierResponse>("/admin/couriers", body)).data;
    },
    onSuccess: ({ courier }) => {
      toast("success", `Akun kurir ${courier.name} dibuat`);
      void queryClient.invalidateQueries({ queryKey: ["admin-couriers", branchId] });
      onClose();
    },
  });
  const busy = create.isPending;

  const field = (key: "name" | "phone" | "password") => ({
    value: draft[key],
    disabled: busy,
    onChange: (e: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [key]: e.target.value }),
    onBlur: () => setTouched({ ...touched, [key]: true }),
    "aria-invalid": touched[key] && errors[key],
  });

  return (
    <Dialog title="Tambah kurir" wide>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) create.mutate();
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="field-label flex flex-col gap-1.5">
            Nama kurir
            <input className="field" autoComplete="off" maxLength={80} autoFocus {...field("name")} />
          </label>
          <label className="field-label flex flex-col gap-1.5">
            No. HP (untuk login)
            <input className="field tabular-nums" inputMode="tel" autoComplete="off" maxLength={17} {...field("phone")} />
          </label>
          <label className="field-label flex flex-col gap-1.5">
            Password awal
            <input className="field" type="password" autoComplete="new-password" maxLength={100} {...field("password")} />
            <span className="text-sm font-normal">Minimal 8 karakter. Berikan ke kurir.</span>
          </label>
          <div className="field-label flex flex-col gap-1.5">
            <span>Mitra kurir</span>
            {partners.isLoading ? (
              <div className="skeleton h-11" role="status" aria-busy="true" aria-label="Memuat mitra" />
            ) : (
              <Select
                label="Mitra kurir"
                icon={<IconTruck />}
                className="w-full"
                value={partnerId}
                onChange={(v) => setDraft({ ...draft, partner_id: v })}
                disabled={busy || !partners.data?.length}
                options={(partners.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
              />
            )}
          </div>
        </div>
        {partners.isError && (
          <p className="alert-box" role="alert">
            Gagal memuat mitra kurir. {errorMessage(partners.error)}
          </p>
        )}
        {partners.data?.length === 0 && <p className="notice">Belum ada mitra kurir aktif.</p>}
        {create.isError && (
          <p className="alert-box" role="alert">
            {errorMessage(create.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Batal
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || invalid}>
            {busy ? "Membuat…" : "Buat akun"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function ReleasesDialog({ courier, onClose }: { courier: AdminCourier; onClose: () => void }) {
  const { branchId } = useBranch();
  const releases = useQuery({
    queryKey: ["admin-courier-releases", branchId, courier.user_id],
    queryFn: async () =>
      (
        await api.get<CourierReleasesResponse>(`/admin/couriers/${courier.user_id}/releases`, {
          params: { branch_id: branchId },
        })
      ).data.releases,
  });

  return (
    <Dialog title={`Order dilepas ${courier.name}`} wide>
      {releases.isLoading && (
        <div className="flex flex-col gap-2" role="status" aria-busy="true" aria-label="Memuat">
          <div className="skeleton h-14" />
          <div className="skeleton h-14" />
        </div>
      )}
      {releases.isError && (
        <p className="alert-box" role="alert">
          {errorMessage(releases.error)}
        </p>
      )}
      {releases.data?.length === 0 && (
        <div className="empty-state">
          <p>{courier.name} belum pernah melepas order.</p>
        </div>
      )}
      {!!releases.data?.length && (
        <>
          <p className="t-label tabular-nums">{releases.data.length} order dilepas</p>
          <ol className="flex max-h-[24rem] flex-col divide-y divide-border overflow-y-auto border-y border-border">
            {releases.data.map((r) => (
              <li key={`${r.order_id}-${r.released_at}`} className="flex flex-col gap-1 py-3">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-bold tabular-nums">{r.order_code}</span>
                  <span className="t-label shrink-0 tabular-nums">{dateTime(r.released_at)}</span>
                </span>
                <span className="text-sm text-muted-foreground">{r.reason}</span>
              </li>
            ))}
          </ol>
        </>
      )}
      <div className="flex justify-end">
        <button className="btn btn-primary" onClick={onClose}>
          Tutup
        </button>
      </div>
    </Dialog>
  );
}
