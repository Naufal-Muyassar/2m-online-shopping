import { useState, type ChangeEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AdminBranch,
  BranchAdminAccount,
  CreateBranchAdminResponse,
  CreateBranchRequest,
  CreateBranchResponse,
  NewBranchAdmin,
  SuperBranch,
  UpdateBranchAdmin,
  UpdateBranchAdminResponse,
} from "@2m/shared";
import { Dialog } from "../../components/Dialog";
import { IconStore } from "../../components/Icons";
import { Select } from "../../components/Select";
import { api, errorMessage } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { BRANCH_CONTEXT_KEY, useAllBranches, useBranch } from "./BranchProvider";
import { LocationInputs, LocationMap, parsePoint, parseRadiusM, pointDraft } from "./LocationSection";

const PHONE = /^\+?[0-9]{8,16}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function useInvalidateBranches() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: [BRANCH_CONTEXT_KEY] });
    void queryClient.invalidateQueries({ queryKey: ["admin-branch"] });
  };
}

// Admin account fields, shared by "Cabang baru" and "Tambah admin".
function useAdminDraft() {
  const [draft, setDraft] = useState({ name: "", phone: "", email: "", password: "" });
  const errors = {
    name: !draft.name.trim(),
    phone: !PHONE.test(draft.phone.trim()),
    email: draft.email.trim() !== "" && !EMAIL.test(draft.email.trim()),
    password: draft.password.length < 8,
  };
  const value: NewBranchAdmin = {
    name: draft.name.trim(),
    phone: draft.phone.trim(),
    password: draft.password,
    ...(draft.email.trim() ? { email: draft.email.trim() } : {}),
  };
  return { draft, setDraft, value, invalid: Object.values(errors).some(Boolean), errors };
}

function AdminFields({ admin, disabled }: { admin: ReturnType<typeof useAdminDraft>; disabled: boolean }) {
  const { draft, setDraft, errors } = admin;
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const field = (key: keyof typeof draft) => ({
    value: draft[key],
    disabled,
    onChange: (e: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [key]: e.target.value }),
    onBlur: () => setTouched({ ...touched, [key]: true }),
    "aria-invalid": touched[key] && errors[key],
  });
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="field-label flex flex-col gap-1.5">
        Nama admin
        <input className="field" autoComplete="off" maxLength={80} {...field("name")} />
      </label>
      <label className="field-label flex flex-col gap-1.5">
        No. HP (untuk login)
        <input className="field tabular-nums" inputMode="tel" autoComplete="off" maxLength={17} {...field("phone")} />
      </label>
      <label className="field-label flex flex-col gap-1.5">
        Email (opsional)
        <input className="field" type="email" autoComplete="off" maxLength={120} {...field("email")} />
      </label>
      <label className="field-label flex flex-col gap-1.5">
        Password awal
        <input className="field" type="password" autoComplete="new-password" maxLength={100} {...field("password")} />
        <span className="text-sm font-normal">Minimal 8 karakter. Berikan ke admin cabang.</span>
      </label>
    </div>
  );
}

function NewBranchDialog({ branches, onClose }: { branches: SuperBranch[]; onClose: () => void }) {
  const { branchId } = useBranch();
  const toast = useToast();
  const invalidate = useInvalidateBranches();
  const template = branches.find((b) => b.id === branchId) ?? branches[0];
  const [name, setName] = useState("");
  const [point, setPoint] = useState(template ? pointDraft(template.lat, template.lng) : { lat: "", lng: "" });
  const [radiusKm, setRadiusKm] = useState("5");
  const [templateId, setTemplateId] = useState(template?.id ?? "");
  const [active, setActive] = useState(false);
  const admin = useAdminDraft();

  const parsed = parsePoint(point);
  const radiusM = parseRadiusM(radiusKm);
  const invalid = !name.trim() || !parsed || radiusM === null || !templateId || admin.invalid;

  const create = useMutation({
    mutationFn: async () => {
      const body: CreateBranchRequest = {
        name: name.trim(),
        lat: parsed!.lat,
        lng: parsed!.lng,
        service_radius_m: radiusM!,
        is_active: active,
        template_branch_id: templateId,
        admin: admin.value,
      };
      return (await api.post<CreateBranchResponse>("/admin/branches", body)).data;
    },
    onSuccess: ({ branch }) => {
      toast("success", `${branch.name} dibuat. Admin bisa login dengan ${admin.value.phone}.`);
      onClose();
    },
    onSettled: invalidate,
  });
  const busy = create.isPending;

  return (
    <Dialog title="Cabang baru" wide>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) create.mutate();
        }}
      >
        <label className="field-label flex flex-col gap-1.5">
          Nama cabang
          <input className="field" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} disabled={busy} autoFocus />
        </label>
        <LocationMap
          point={point}
          radiusKm={radiusKm}
          onPoint={setPoint}
          disabled={busy}
          className="isolate h-56 w-full shrink-0 overflow-hidden rounded-lg border border-border"
        />
        <p className="-mt-2 text-sm text-muted-foreground">Klik peta untuk menaruh titik cabang.</p>
        <LocationInputs point={point} radiusKm={radiusKm} onPoint={setPoint} onRadius={setRadiusKm} disabled={busy} />
        <div className="field-label flex flex-col gap-1.5">
          <span>Salin produk, harga dan tarif ongkir dari</span>
          <Select
            label="Cabang contoh"
            icon={<IconStore />}
            className="w-full"
            value={templateId}
            onChange={setTemplateId}
            disabled={busy}
            options={branches.map((b) => ({ value: b.id, label: b.name, hint: `${b.product_count} produk` }))}
          />
          <span className="text-sm font-normal">Stok cabang baru mulai dari 0; admin cabang yang mengisinya.</span>
        </div>

        <div className="section-head">
          <h3 className="font-bold">Akun admin cabang</h3>
        </div>
        <AdminFields admin={admin} disabled={busy} />

        <label className="option-row" data-selected={active}>
          <input
            type="checkbox"
            className="size-5 shrink-0 accent-primary"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            disabled={busy}
          />
          <span>
            Langsung tampilkan ke pelanggan
            <span className="block text-sm font-normal text-muted-foreground">Biarkan mati sampai stok cabang terisi.</span>
          </span>
        </label>

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
            {busy ? "Membuat…" : "Buat cabang"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function NewAdminDialog({ branch, onClose }: { branch: SuperBranch; onClose: () => void }) {
  const toast = useToast();
  const invalidate = useInvalidateBranches();
  const admin = useAdminDraft();
  const create = useMutation({
    mutationFn: async () => (await api.post<CreateBranchAdminResponse>(`/admin/branches/${branch.id}/admins`, admin.value)).data,
    onSuccess: ({ admin: a }) => {
      toast("success", `Akun ${a.name} dibuat untuk ${branch.name}`);
      onClose();
    },
    onSettled: invalidate,
  });
  const busy = create.isPending;

  return (
    <Dialog title={`Tambah admin ${branch.name}`} wide>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!admin.invalid) create.mutate();
        }}
      >
        <AdminFields admin={admin} disabled={busy} />
        {create.isError && (
          <p className="alert-box" role="alert">
            {errorMessage(create.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Batal
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || admin.invalid}>
            {busy ? "Membuat…" : "Buat akun"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function ToggleDialog({ branch, onClose }: { branch: SuperBranch; onClose: () => void }) {
  const toast = useToast();
  const invalidate = useInvalidateBranches();
  const opening = !branch.is_active;
  const toggle = useMutation({
    mutationFn: async () =>
      (await api.patch<AdminBranch>("/admin/branch", { branch_id: branch.id, is_active: opening })).data,
    onSuccess: (b) => {
      toast("success", b.is_active ? `${b.name} sekarang tampil ke pelanggan` : `${b.name} disembunyikan dari pelanggan`);
      onClose();
    },
    onSettled: invalidate,
  });

  return (
    <Dialog title={opening ? `Aktifkan ${branch.name}?` : `Nonaktifkan ${branch.name}?`}>
      <p className="text-muted-foreground">
        {opening
          ? "Pelanggan bisa memilih cabang ini dan memesan produk yang stoknya sudah diisi."
          : "Pelanggan tidak bisa lagi memilih cabang ini. Pesanan yang sudah berjalan tetap diproses dan admin cabang tetap bisa login."}
      </p>
      {toggle.isError && (
        <p className="alert-box" role="alert">
          {errorMessage(toggle.error)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button className="btn btn-secondary" onClick={onClose} disabled={toggle.isPending}>
          Batal
        </button>
        <button
          className={opening ? "btn btn-primary" : "btn btn-danger"}
          onClick={() => toggle.mutate()}
          disabled={toggle.isPending}
        >
          {toggle.isPending ? "Memproses…" : opening ? "Aktifkan" : "Nonaktifkan"}
        </button>
      </div>
    </Dialog>
  );
}

// Name, login, email, password, status and branch of one admin account.
function EditAdminDialog({
  admin,
  branch,
  branches,
  onClose,
}: {
  admin: BranchAdminAccount;
  branch: SuperBranch;
  branches: SuperBranch[];
  onClose: () => void;
}) {
  const toast = useToast();
  const invalidate = useInvalidateBranches();
  const [name, setName] = useState(admin.name);
  const [phone, setPhone] = useState(admin.phone);
  const [email, setEmail] = useState(admin.email ?? "");
  const [password, setPassword] = useState("");
  const [active, setActive] = useState(admin.is_active);
  const [branchId, setBranchId] = useState(branch.id);

  const changes: UpdateBranchAdmin = {};
  if (name.trim() !== admin.name) changes.name = name.trim();
  if (phone.trim() !== admin.phone) changes.phone = phone.trim();
  if (email.trim() !== (admin.email ?? "")) changes.email = email.trim() === "" ? null : email.trim();
  if (password !== "") changes.password = password;
  if (active !== admin.is_active) changes.is_active = active;
  if (branchId !== branch.id) changes.move_to_branch_id = branchId;

  const errors = {
    name: !name.trim(),
    phone: !PHONE.test(phone.trim()),
    email: email.trim() !== "" && !EMAIL.test(email.trim()),
    password: password !== "" && password.length < 8,
  };
  const invalid = Object.values(errors).some(Boolean);
  const dirty = Object.keys(changes).length > 0;
  const signsOut = changes.password !== undefined || changes.is_active === false || changes.move_to_branch_id !== undefined;

  const save = useMutation({
    mutationFn: async () => (await api.patch<UpdateBranchAdminResponse>(`/admin/branch-admins/${admin.id}`, changes)).data,
    onSuccess: ({ admin: a }) => {
      toast("success", signsOut ? `Akun ${a.name} disimpan dan dikeluarkan dari semua perangkat` : `Akun ${a.name} disimpan`);
      onClose();
    },
    onSettled: invalidate,
  });
  const busy = save.isPending;

  return (
    <Dialog title={`Ubah akun ${admin.name}`} wide>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty && !invalid) save.mutate();
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="field-label flex flex-col gap-1.5">
            Nama admin
            <input className="field" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} aria-invalid={errors.name} />
          </label>
          <label className="field-label flex flex-col gap-1.5">
            No. HP (untuk login)
            <input
              className="field tabular-nums"
              inputMode="tel"
              maxLength={17}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={busy}
              aria-invalid={errors.phone}
            />
          </label>
          <label className="field-label flex flex-col gap-1.5">
            Email (opsional)
            <input
              className="field"
              type="email"
              maxLength={120}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              aria-invalid={errors.email}
            />
          </label>
          <label className="field-label flex flex-col gap-1.5">
            Password baru
            <input
              className="field"
              type="password"
              autoComplete="new-password"
              maxLength={100}
              placeholder="Kosongkan kalau tidak diganti"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              aria-invalid={errors.password}
            />
            <span className="text-sm font-normal">Minimal 8 karakter.</span>
          </label>
        </div>
        <div className="field-label flex flex-col gap-1.5">
          <span>Cabang</span>
          <Select
            label="Cabang admin"
            icon={<IconStore />}
            className="w-full"
            value={branchId}
            onChange={setBranchId}
            disabled={busy}
            options={branches.map((b) => ({ value: b.id, label: b.name, hint: b.is_active ? undefined : "Nonaktif" }))}
          />
        </div>
        <label className="option-row" data-selected={active}>
          <input
            type="checkbox"
            className="size-5 shrink-0 accent-primary"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            disabled={busy}
          />
          <span>
            Akun aktif
            <span className="block text-sm font-normal text-muted-foreground">Akun nonaktif tidak bisa login.</span>
          </span>
        </label>
        {signsOut && (
          <p className="notice">Admin akan keluar dari semua perangkat dan perlu login lagi{changes.password ? " dengan password baru" : ""}.</p>
        )}
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

type Open =
  | { dialog: "new" }
  | { dialog: "admin" | "toggle"; branchId: string }
  | { dialog: "edit-admin"; branchId: string; adminId: string }
  | null;

export function BranchesSection() {
  const branches = useAllBranches();
  const [open, setOpen] = useState<Open>(null);
  const rows = branches.data ?? [];
  const selected = open && open.dialog !== "new" ? rows.find((b) => b.id === open.branchId) : undefined;
  const editingAdmin = open?.dialog === "edit-admin" ? selected?.admins.find((a) => a.id === open.adminId) : undefined;
  const close = () => setOpen(null);

  return (
    <div className="flex flex-col gap-4">
      <button className="btn btn-primary self-start" onClick={() => setOpen({ dialog: "new" })} disabled={rows.length === 0}>
        Cabang baru
      </button>
      {branches.isLoading && (
        <div className="space-y-3" role="status" aria-busy="true" aria-label="Memuat">
          <div className="skeleton h-16" />
          <div className="skeleton h-16" />
        </div>
      )}
      {branches.isError && (
        <p className="alert-box" role="alert">
          {errorMessage(branches.error)}
        </p>
      )}
      {branches.isSuccess && rows.length === 0 && (
        <div className="empty-state">
          <p>Belum ada cabang. Jalankan seed demo dulu, karena cabang baru menyalin produk dan tarif dari cabang yang ada.</p>
        </div>
      )}
      {rows.length > 0 && (
        <div className="card animate-rise overflow-hidden p-0 md:p-0">
          <table className="data-table">
            <thead>
              <tr>
                <th>Cabang</th>
                <th>Status</th>
                <th>Admin</th>
                <th className="text-right">Produk</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td data-primary>
                    <span className="block font-bold">{b.name}</span>
                    <span className="t-label mt-0.5 block tabular-nums">
                      Jangkauan {String(b.service_radius_m / 1000).replace(".", ",")} km
                    </span>
                  </td>
                  <td data-label="Status">
                    <span className={b.is_active ? "pill pill-dot pill-success" : "pill pill-dot"}>
                      {b.is_active ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td data-label="Admin">
                    {b.admins.length === 0 ? (
                      <span className="text-muted-foreground">Belum ada</span>
                    ) : (
                      <ul className="flex flex-col gap-1">
                        {b.admins.map((a) => (
                          <li key={a.id} className="flex min-w-0 flex-wrap items-center gap-x-2 md:justify-start">
                            <span className={a.is_active ? "font-medium" : "font-medium text-muted-foreground line-through"}>
                              {a.name}
                            </span>
                            <span className="t-label tabular-nums">{a.phone}</span>
                            <button
                              type="button"
                              className="link -my-2 text-sm"
                              aria-label={`Ubah akun ${a.name}`}
                              onClick={() => setOpen({ dialog: "edit-admin", branchId: b.id, adminId: a.id })}
                            >
                              Ubah
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td data-label="Produk" className="tabular-nums md:text-right">
                    {b.product_count}
                  </td>
                  <td data-actions className="md:whitespace-nowrap md:text-right">
                    <span className="inline-flex flex-wrap gap-2 md:justify-end">
                      <button className="btn btn-secondary btn-sm" onClick={() => setOpen({ dialog: "admin", branchId: b.id })}>
                        Tambah admin
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setOpen({ dialog: "toggle", branchId: b.id })}>
                        {b.is_active ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open?.dialog === "new" && <NewBranchDialog branches={rows} onClose={close} />}
      {selected && open?.dialog === "admin" && <NewAdminDialog branch={selected} onClose={close} />}
      {selected && open?.dialog === "toggle" && <ToggleDialog branch={selected} onClose={close} />}
      {selected && open?.dialog === "edit-admin" && editingAdmin && (
        <EditAdminDialog admin={editingAdmin} branch={selected} branches={rows} onClose={close} />
      )}
    </div>
  );
}
