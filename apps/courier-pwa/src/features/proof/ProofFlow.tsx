import { useEffect, useMemo, useState } from "react";
import { FAILED_REASONS, type FailedReason } from "@2m/shared";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api";
import { STEPS, useProofSubmit } from "./useProofSubmit";

const REASON_LABELS: Record<FailedReason, string> = {
  CUSTOMER_UNREACHABLE: "Pelanggan tidak bisa dihubungi",
  ADDRESS_NOT_FOUND: "Alamat tidak ditemukan",
  REFUSED: "Pelanggan menolak pesanan",
  OTHER: "Lainnya",
};

interface Props {
  orderId: string;
  mode: "DELIVERED" | "FAILED";
  onDone: () => void;
  onCancel: () => void;
}

export function ProofFlow({ orderId, mode, onDone, onCancel }: Props) {
  const { notify } = useToast();
  const { run, reset, step, uploadPct, running } = useProofSubmit(orderId);
  const [file, setFile] = useState<File | null>(null);
  const [reason, setReason] = useState<FailedReason | "">("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  const failed = mode === "FAILED";
  const canSubmit = !!file && (!failed || (reason !== "" && (note.trim() !== "" || reason !== "OTHER")));

  const submit = async () => {
    if (!file) return;
    setError(null);
    try {
      await run({ file, to: mode, reason: failed ? (reason as FailedReason) : undefined, note: failed ? note.trim() : undefined });
      notify("success", failed ? "Pengiriman dicatat gagal." : "Pesanan selesai diantar.");
      onDone();
    } catch (err) {
      const msg = errorMessage(err);
      setError(msg);
      notify("error", msg);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border p-4">
      <h2 className="text-xl font-bold">{failed ? "Gagal kirim" : "Selesai antar"}</h2>

      {failed && (
        <>
          <label className="flex flex-col gap-1 font-medium">
            Alasan
            <select
              className="h-14 rounded-lg border border-input bg-background px-3 text-lg"
              value={reason}
              onChange={(e) => setReason(e.target.value as FailedReason)}
              disabled={running}
            >
              <option value="">Pilih alasan…</option>
              {FAILED_REASONS.map((r) => (
                <option key={r} value={r}>
                  {REASON_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 font-medium">
            Catatan
            <textarea
              className="min-h-24 rounded-lg border border-input bg-background p-3 text-lg"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={running}
            />
          </label>
        </>
      )}

      <label className="flex flex-col gap-2 font-medium">
        Foto bukti
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={running}
          className="text-base"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            reset();
          }}
        />
      </label>
      {preview && <img src={preview} alt="Pratinjau foto bukti" className="max-h-64 w-full rounded-lg object-contain" />}

      {step >= 0 && (
        <ol className="flex flex-col gap-1 text-base" aria-label="Progres">
          {STEPS.map((label, i) => (
            <li key={label} className={i < step ? "text-primary" : i === step ? "font-semibold" : "text-muted-foreground"}>
              {i < step ? "✓" : i === step && running ? "…" : "•"} {label}
              {i === 2 && step === 2 && running ? ` (${uploadPct}%)` : ""}
            </li>
          ))}
        </ol>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-destructive">
          {error}
        </p>
      )}

      <Button variant={failed ? "destructive" : "primary"} loading={running} disabled={!canSubmit} onClick={submit}>
        {error ? "Coba lagi" : failed ? "Kirim laporan gagal" : "Kirim bukti & selesai"}
      </Button>
      <Button variant="secondary" disabled={running} onClick={onCancel}>
        Batal
      </Button>
    </section>
  );
}
