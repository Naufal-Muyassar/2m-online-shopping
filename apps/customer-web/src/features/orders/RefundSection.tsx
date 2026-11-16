import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  REFUND_PROVIDERS,
  REFUND_REASON_LABELS,
  formatIDR,
  type CustomerRefund,
  type RefundDestinationRequest,
  type RefundMethod,
  type RefundStatus,
} from "@2m/shared";
import { api, errorMessage } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { cn } from "../../lib/utils";

const STATUS: Record<RefundStatus, { label: string; pill: string }> = {
  NEEDS_DESTINATION: { label: "Isi rekening tujuan", pill: "pill-warning" },
  READY: { label: "Diproses toko", pill: "pill-info" },
  COMPLETED: { label: "Dana sudah dikirim", pill: "pill-success" },
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function DestinationForm({ orderId, refund, onDone }: { orderId: string; refund: CustomerRefund; onDone?: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [method, setMethod] = useState<RefundMethod>(refund.destination?.method ?? "BANK");
  const [provider, setProvider] = useState(refund.destination?.provider ?? REFUND_PROVIDERS.BANK[0]!);
  const [accountNo, setAccountNo] = useState("");
  const [accountName, setAccountName] = useState(refund.destination?.account_name ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const body: RefundDestinationRequest = { method, provider, account_no: accountNo, account_name: accountName.trim() };
      return (await api.put<{ refund: CustomerRefund }>(`/orders/${orderId}/refunds/${refund.id}/destination`, body)).data.refund;
    },
    onSuccess: () => {
      toast("success", "Rekening tujuan tersimpan");
      void qc.invalidateQueries({ queryKey: ["order", orderId] });
      onDone?.();
    },
  });

  const valid = /^\+?[0-9]{6,20}$/.test(accountNo.replace(/[\s-]/g, "")) && accountName.trim().length >= 2;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save.mutate();
      }}
    >
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Jenis rekening">
        {(["BANK", "EWALLET"] as const).map((m) => (
          <label key={m} className="option-row" data-selected={method === m}>
            <input
              type="radio"
              name={`method-${refund.id}`}
              checked={method === m}
              onChange={() => {
                setMethod(m);
                setProvider(REFUND_PROVIDERS[m][0]!);
              }}
              className="size-5 shrink-0 accent-primary"
            />
            {m === "BANK" ? "Rekening bank" : "E-wallet"}
          </label>
        ))}
      </div>
      <label className="field-label flex flex-col gap-1.5">
        {method === "BANK" ? "Bank" : "E-wallet"}
        <select className="field" value={provider} onChange={(e) => setProvider(e.target.value)} disabled={save.isPending}>
          {REFUND_PROVIDERS[method].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label flex flex-col gap-1.5">
        {method === "BANK" ? "Nomor rekening" : "Nomor HP e-wallet"}
        <input
          className="field tabular-nums"
          inputMode="numeric"
          autoComplete="off"
          maxLength={24}
          value={accountNo}
          onChange={(e) => setAccountNo(e.target.value.replace(/[^\d+\s-]/g, ""))}
          disabled={save.isPending}
        />
      </label>
      <label className="field-label flex flex-col gap-1.5">
        Nama pemilik
        <input className="field" autoComplete="name" maxLength={80} value={accountName} onChange={(e) => setAccountName(e.target.value)} disabled={save.isPending} />
      </label>
      {save.isError && (
        <p className="alert-box" role="alert">
          {errorMessage(save.error)}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary" disabled={!valid || save.isPending}>
          {save.isPending ? "Menyimpan…" : "Simpan rekening"}
        </button>
        {onDone && (
          <button type="button" className="btn btn-secondary" onClick={onDone} disabled={save.isPending}>
            Batal
          </button>
        )}
      </div>
    </form>
  );
}

function RefundCard({ orderId, refund, onImageError }: { orderId: string; refund: CustomerRefund; onImageError: () => void }) {
  const [editing, setEditing] = useState(false);
  const [zoom, setZoom] = useState(false);
  const status = STATUS[refund.status];

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="t-figure">{formatIDR(refund.amount)}</p>
          <p>{REFUND_REASON_LABELS[refund.reason]}</p>
          {refund.note && <p className="text-muted-foreground">{refund.note}</p>}
          <p className="t-label tabular-nums">Dibuat {fmtTime(refund.created_at)}</p>
        </div>
        <span className={cn("pill pill-dot shrink-0", status.pill)}>{status.label}</span>
      </div>

      {refund.status === "NEEDS_DESTINATION" && (
        <>
          <p className="notice">Isi rekening atau e-wallet tujuan agar toko bisa mengirim dana Anda.</p>
          <DestinationForm orderId={orderId} refund={refund} />
        </>
      )}

      {refund.status !== "NEEDS_DESTINATION" && refund.destination && !editing && (
        <dl className="spec-list">
          <dt>Dikirim ke</dt>
          <dd>
            {refund.destination.provider} <span className="tabular-nums">{refund.destination.account_masked}</span>
          </dd>
          <dt>Atas nama</dt>
          <dd>{refund.destination.account_name}</dd>
          {refund.transfer_ref && (
            <>
              <dt>No. referensi</dt>
              <dd className="tabular-nums">{refund.transfer_ref}</dd>
            </>
          )}
          {refund.completed_at && (
            <>
              <dt>Dikirim pada</dt>
              <dd className="tabular-nums">{fmtTime(refund.completed_at)}</dd>
            </>
          )}
        </dl>
      )}

      {refund.status === "READY" &&
        (editing ? (
          <DestinationForm orderId={orderId} refund={refund} onDone={() => setEditing(false)} />
        ) : (
          <div className="flex flex-col items-start gap-2">
            <p className="text-muted-foreground">Toko sedang memproses transfer. Bukti transfer akan muncul di sini.</p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
              Ubah rekening
            </button>
          </div>
        ))}

      {refund.status === "COMPLETED" && refund.proof_url && (
        <>
          <p className="field-label">Bukti transfer dari toko</p>
          <button type="button" onClick={() => setZoom(true)} className="block w-full overflow-hidden rounded-md border border-border bg-muted" aria-label="Perbesar bukti transfer">
            <img
              src={refund.proof_url}
              alt="Bukti transfer refund"
              onError={onImageError}
              className="max-h-72 w-full object-contain transition-transform duration-300 ease-settle hover:scale-[1.02]"
            />
          </button>
          {zoom && (
            <div role="dialog" aria-label="Bukti transfer refund" onClick={() => setZoom(false)} className="dialog-backdrop">
              <img src={refund.proof_url} alt="Bukti transfer refund" onError={onImageError} className="max-h-full max-w-full animate-pop rounded-lg shadow-lg" />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function RefundSection({ orderId, refunds, onImageError }: { orderId: string; refunds: CustomerRefund[]; onImageError: () => void }) {
  if (refunds.length === 0) return null;
  const total = refunds.reduce((s, r) => s + r.amount, 0);
  return (
    <section className="card animate-rise flex flex-col gap-4 text-sm" aria-labelledby="refund-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="refund-title" className="t-title">
          Pengembalian dana
        </h2>
        {refunds.length > 1 && <span className="t-label tabular-nums">Total {formatIDR(total)}</span>}
      </div>
      {refunds.map((r) => (
        <RefundCard key={r.id} orderId={orderId} refund={r} onImageError={onImageError} />
      ))}
    </section>
  );
}
