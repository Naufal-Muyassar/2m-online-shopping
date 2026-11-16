import { useRef, useState } from "react";
import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  REFUND_REASON_LABELS,
  formatIDR,
  type AdminCompleteRefundRequest,
  type AdminCreateRefundRequest,
  type AdminRefund,
  type AdminRefundsResponse,
  type RefundProofUploadResponse,
  type RefundStatus,
} from "@2m/shared";
import { api, errorMessage } from "../../lib/api";
import { compressImage } from "../../lib/image";
import { useToast } from "../../lib/toast";
import { cn } from "../../lib/utils";
import { Dialog } from "../../components/Dialog";
import { Segmented } from "../../components/Segmented";
import { IconImage, IconPlus } from "../../components/Icons";
import { useBranch } from "../branch-config/BranchProvider";

type State = "open" | "completed";
const KEY = "admin-refunds";

const STATUS: Record<RefundStatus, { label: string; pill: string }> = {
  NEEDS_DESTINATION: { label: "Menunggu rekening", pill: "pill-warning" },
  READY: { label: "Siap ditransfer", pill: "pill-info" },
  COMPLETED: { label: "Selesai", pill: "pill-success" },
};

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function useRefunds(state: State, pollMs = 15_000) {
  const { branchId } = useBranch();
  return useQuery({
    queryKey: [KEY, branchId, state],
    enabled: !!branchId,
    refetchInterval: pollMs,
    queryFn: async () =>
      (await api.get<AdminRefundsResponse>("/admin/refunds", { params: { branch_id: branchId, state } })).data.refunds,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  const { branchId } = useBranch();
  return () => qc.invalidateQueries({ queryKey: [KEY, branchId] });
}

function Destination({ r }: { r: AdminRefund }) {
  if (!r.destination) return <span className="text-muted-foreground">Customer belum mengisi</span>;
  return (
    <span className="flex flex-col">
      <span className="font-bold">
        {r.destination.provider} <span className="tabular-nums">{r.destination.account_no}</span>
      </span>
      <span className="text-muted-foreground">a.n. {r.destination.account_name}</span>
    </span>
  );
}

function CompleteDialog({ refund, onClose }: { refund: AdminRefund; onClose: () => void }) {
  const { branchId } = useBranch();
  const toast = useToast();
  const invalidate = useInvalidate();
  const [preview, setPreview] = useState<string | null>(null);
  const [proofKey, setProofKey] = useState<string | null>(null);
  const [transferRef, setTransferRef] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const blob = await compressImage(file);
      const target = (
        await api.post<RefundProofUploadResponse>(`/admin/refunds/${refund.id}/proof-upload-url`, null, { params: { branch_id: branchId } })
      ).data;
      try {
        await axios.put(target.upload_url, blob, { headers: { "Content-Type": "image/jpeg" } });
      } catch {
        throw new Error("Unggah gagal. Periksa koneksi lalu coba lagi.");
      }
      return { key: target.proof_key, url: URL.createObjectURL(blob) };
    },
    onMutate: () => setProofKey(null),
    onSuccess: ({ key, url }) => {
      setProofKey(key);
      setPreview(url);
    },
  });

  // Same receipt key on a retry, so a lost response is answered with the completed refund, not a second payout.
  const complete = useMutation({
    mutationFn: async () => {
      const body: AdminCompleteRefundRequest = { transfer_ref: transferRef.trim(), proof_key: proofKey! };
      return (await api.post<{ refund: AdminRefund }>(`/admin/refunds/${refund.id}/complete`, body, { params: { branch_id: branchId } }))
        .data.refund;
    },
    retry: (count, err) => count < 2 && axios.isAxiosError(err) && !err.response,
    onSuccess: () => {
      toast("success", `Refund ${formatIDR(refund.amount)} untuk ${refund.order_code} selesai`);
      onClose();
    },
    onSettled: invalidate,
  });

  const busy = upload.isPending || complete.isPending;
  return (
    <Dialog title={`Bayar refund ${refund.order_code}`}>
      <div className="flex flex-col gap-1 border-y border-border py-3">
        <p className="t-label">Transfer ke {refund.customer_name}</p>
        <p className="t-figure">{formatIDR(refund.amount)}</p>
        <p className="text-sm">
          <Destination r={refund} />
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="field-label">Bukti transfer</span>
        {preview ? (
          <img src={preview} alt="Bukti transfer yang diunggah" className="max-h-56 w-full rounded-md border border-border bg-muted object-contain" />
        ) : (
          <p className="notice">Foto atau tangkapan layar struk transfer. Customer akan melihat foto ini.</p>
        )}
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.mutate(file);
            e.target.value = "";
          }}
        />
        <button type="button" className="btn btn-secondary btn-sm self-start" onClick={() => input.current?.click()} disabled={busy}>
          <IconImage aria-hidden="true" />
          {upload.isPending ? "Mengunggah…" : preview ? "Ganti foto" : "Unggah bukti"}
        </button>
        {upload.isError && (
          <p className="alert-box" role="alert">
            {errorMessage(upload.error)}
          </p>
        )}
      </div>

      <label className="field-label flex flex-col gap-1.5">
        No. referensi transfer
        <input
          className="field"
          autoComplete="off"
          maxLength={80}
          value={transferRef}
          placeholder="mis. nomor transaksi di struk"
          onChange={(e) => setTransferRef(e.target.value)}
          disabled={busy}
        />
      </label>
      {complete.isError && (
        <p className="alert-box" role="alert">
          {errorMessage(complete.error)}
        </p>
      )}
      <p className="notice">Tandai selesai setelah uang benar-benar terkirim. Refund yang selesai tidak bisa diubah.</p>
      <div className="flex justify-end gap-2">
        <button className="btn btn-secondary" onClick={onClose} disabled={complete.isPending}>
          Batal
        </button>
        <button
          className="btn btn-primary"
          onClick={() => complete.mutate()}
          disabled={busy || !proofKey || transferRef.trim().length < 3}
        >
          {complete.isPending ? "Menyimpan…" : "Tandai selesai"}
        </button>
      </div>
    </Dialog>
  );
}

function ProofDialog({ refund, onClose }: { refund: AdminRefund; onClose: () => void }) {
  return (
    <Dialog title={`Bukti refund ${refund.order_code}`}>
      <div className="flex flex-col gap-1 border-y border-border py-3">
        <p className="t-figure">{formatIDR(refund.amount)}</p>
        <p className="text-sm">
          <Destination r={refund} />
        </p>
        <p className="t-label tabular-nums">
          Ref {refund.transfer_ref} · {refund.completed_at && dateTime(refund.completed_at)}
          {refund.completed_by_name && ` · ${refund.completed_by_name}`}
        </p>
      </div>
      {refund.proof_url && (
        <img src={refund.proof_url} alt="Bukti transfer" className="max-h-[55dvh] w-full rounded-md border border-border bg-muted object-contain" />
      )}
      <div className="flex justify-end">
        <button className="btn btn-secondary" onClick={onClose}>
          Tutup
        </button>
      </div>
    </Dialog>
  );
}

function ManualDialog({ onClose }: { onClose: () => void }) {
  const { branchId } = useBranch();
  const toast = useToast();
  const invalidate = useInvalidate();
  const [code, setCode] = useState("");
  const [digits, setDigits] = useState("");
  const [note, setNote] = useState("");
  // One key per dialog: a retry after a lost response cannot open two refunds.
  const idempotencyKey = useRef(crypto.randomUUID());
  const amount = Number(digits);

  const create = useMutation({
    mutationFn: async () => {
      const body: AdminCreateRefundRequest = {
        order_code: code.trim().toUpperCase(),
        amount,
        note: note.trim(),
        idempotency_key: idempotencyKey.current,
      };
      return (await api.post<{ refund: AdminRefund }>("/admin/refunds", body, { params: { branch_id: branchId } })).data.refund;
    },
    retry: (count, err) => count < 2 && axios.isAxiosError(err) && !err.response,
    onSuccess: (r) => {
      toast("success", `Refund ${formatIDR(r.amount)} untuk ${r.order_code} dibuat`);
      onClose();
    },
    onSettled: invalidate,
  });
  const remaining = (create.error && axios.isAxiosError(create.error)
    ? (create.error.response?.data as { error?: { details?: { remaining?: number } } })?.error?.details?.remaining
    : undefined) as number | undefined;

  return (
    <Dialog title="Refund manual">
      <p className="text-sm text-muted-foreground">
        Untuk pesanan yang sudah dibayar, misalnya barang rusak atau gagal kirim. Customer akan diminta mengisi rekening tujuan.
      </p>
      <label className="field-label flex flex-col gap-1.5">
        Kode pesanan
        <input className="field uppercase" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ORD-…" disabled={create.isPending} />
      </label>
      <label className="field-label flex flex-col gap-1.5">
        Jumlah (Rp)
        <input
          className="field tabular-nums"
          inputMode="numeric"
          autoComplete="off"
          maxLength={12}
          value={digits}
          onChange={(e) => setDigits(e.target.value.replace(/\D/g, ""))}
          disabled={create.isPending}
        />
      </label>
      <label className="field-label flex flex-col gap-1.5">
        Alasan (terlihat oleh customer)
        <textarea className="field min-h-20" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} disabled={create.isPending} />
      </label>
      {create.isError && (
        <p className="alert-box" role="alert">
          {errorMessage(create.error)}
          {remaining !== undefined && ` Sisa yang bisa direfund ${formatIDR(remaining)}.`}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button className="btn btn-secondary" onClick={onClose} disabled={create.isPending}>
          Batal
        </button>
        <button
          className="btn btn-primary"
          onClick={() => create.mutate()}
          disabled={create.isPending || code.trim().length < 4 || amount <= 0 || note.trim().length < 3}
        >
          {create.isPending ? "Membuat…" : amount > 0 ? `Buat refund ${formatIDR(amount)}` : "Buat refund"}
        </button>
      </div>
    </Dialog>
  );
}

export function RefundsPage() {
  const { branchId } = useBranch();
  const [state, setState] = useState<State>("open");
  const [open, setOpen] = useState<{ dialog: "complete" | "proof"; id: string } | "manual" | null>(null);
  const list = useRefunds(state);
  const openCount = useRefunds("open").data?.length;

  if (!branchId) return <p className="p-4 text-sm text-muted-foreground md:p-6">Pilih cabang…</p>;

  const refunds = list.data ?? [];
  // Looked up on every render, so an open dialog follows the polled row.
  const selected = typeof open === "object" && open ? refunds.find((r) => r.id === open.id) : undefined;
  const close = () => setOpen(null);

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="t-headline">Refund</h1>
          <p className="text-muted-foreground">Transfer dana ke customer, lalu unggah bukti transfernya. Customer melihat bukti itu di halaman pesanan.</p>
        </div>
        <button className="btn btn-secondary" onClick={() => setOpen("manual")}>
          <IconPlus aria-hidden="true" /> Refund manual
        </button>
      </div>

      <Segmented
        label="Status refund"
        className="w-full self-start sm:w-80"
        value={state}
        onChange={setState}
        items={[
          { id: "open", label: openCount ? `Perlu diproses (${openCount})` : "Perlu diproses" },
          { id: "completed", label: "Selesai" },
        ]}
      />

      {list.isLoading && (
        <div className="space-y-3" role="status" aria-busy="true" aria-label="Memuat">
          <div className="skeleton h-14" />
          <div className="skeleton h-14" />
        </div>
      )}
      {list.isError && (
        <p className="alert-box" role="alert">
          {list.data ? "Gagal memperbarui daftar. Data di bawah mungkin sudah lama." : errorMessage(list.error)}
        </p>
      )}
      {list.isSuccess && refunds.length === 0 && (
        <div className="empty-state">
          <p className="t-title">{state === "open" ? "Tidak ada refund yang menunggu." : "Belum ada refund yang selesai."}</p>
          <p className="text-muted-foreground">
            {state === "open"
              ? "Refund dibuat otomatis saat pesanan yang sudah dibayar dibatalkan atau barangnya kurang."
              : "Refund yang sudah ditransfer dan diberi bukti muncul di sini."}
          </p>
        </div>
      )}
      {refunds.length > 0 && (
        <div className="card animate-rise overflow-hidden p-0 md:p-0">
          <table className="data-table">
            <thead>
              <tr>
                <th>Pesanan</th>
                <th>Alasan</th>
                <th className="text-right">Jumlah</th>
                <th>Rekening tujuan</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {refunds.map((r) => (
                <tr key={r.id}>
                  <td data-primary>
                    <span className="flex flex-col">
                      <span className="whitespace-nowrap font-extrabold tracking-tight tabular-nums">{r.order_code}</span>
                      <span className="text-muted-foreground">{r.customer_name}</span>
                    </span>
                  </td>
                  <td data-label="Alasan">
                    <span className="flex flex-col">
                      <span>{REFUND_REASON_LABELS[r.reason]}</span>
                      {r.note && <span className="text-muted-foreground">{r.note}</span>}
                      <span className="t-label tabular-nums">{dateTime(r.created_at)}</span>
                    </span>
                  </td>
                  <td data-label="Jumlah" className="text-base font-extrabold tabular-nums tracking-tight md:text-right">
                    {formatIDR(r.amount)}
                  </td>
                  <td data-label="Rekening">
                    <Destination r={r} />
                  </td>
                  <td data-label="Status">
                    <span className={cn("pill pill-dot", STATUS[r.status].pill)}>{STATUS[r.status].label}</span>
                  </td>
                  <td data-actions className="md:whitespace-nowrap md:text-right">
                    {r.status === "READY" && (
                      <button className="btn btn-primary btn-sm" onClick={() => setOpen({ dialog: "complete", id: r.id })}>
                        Bayar &amp; unggah bukti
                      </button>
                    )}
                    {r.status === "COMPLETED" && (
                      <button className="btn btn-secondary btn-sm" onClick={() => setOpen({ dialog: "proof", id: r.id })}>
                        <IconImage aria-hidden="true" /> Lihat bukti
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open === "manual" && <ManualDialog onClose={close} />}
      {selected && typeof open === "object" && open?.dialog === "complete" && <CompleteDialog refund={selected} onClose={close} />}
      {selected && typeof open === "object" && open?.dialog === "proof" && <ProofDialog refund={selected} onClose={close} />}
    </div>
  );
}
