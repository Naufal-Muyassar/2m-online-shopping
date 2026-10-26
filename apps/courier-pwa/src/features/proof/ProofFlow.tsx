import { useEffect, useMemo, useState } from "react";
import { FAILED_REASONS, type FailedReason } from "@2m/shared";
import { Button } from "@/components/ui/button";
import { FaCheck, FaExclamationTriangle, FaRedoAlt, FaTimes } from "react-icons/fa";
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
    <section className="card flex animate-rise flex-col gap-4">
      <h2 className="text-xl font-bold">{failed ? "Gagal kirim" : "Selesai antar"}</h2>

      {failed && (
        <>
          <label className="flex flex-col gap-1 text-sm font-medium text-muted-foreground">
            Alasan
            <select
              className="field h-14 text-lg"
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
          <label className="flex flex-col gap-1 text-sm font-medium text-muted-foreground">
            Catatan
            <textarea
              className="field min-h-24 text-lg"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={running}
            />
          </label>
        </>
      )}

      <label className="flex flex-col gap-2 text-sm font-medium text-muted-foreground">
        Foto bukti
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={running}
          className="text-base text-foreground file:mr-3 file:min-h-11 file:rounded-md file:border-0 file:bg-primary-surface file:px-4 file:font-bold file:text-primary-pressed"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            reset();
          }}
        />
      </label>
      {preview && <img src={preview} alt="Pratinjau foto bukti" className="max-h-64 w-full rounded-md border border-border object-contain" />}

      {step >= 0 && (
        <ol className="flex flex-col gap-1 text-base" aria-label="Progres">
          {STEPS.map((label, i) => (
            <li key={label} className={i < step ? "text-success" : i === step ? "font-semibold" : "text-muted-foreground"}>
              {i < step ? "✓" : i === step && running ? "…" : "•"} {label}
              {i === 2 && step === 2 && running ? ` (${uploadPct}%)` : ""}
            </li>
          ))}
        </ol>
      )}

      {error && (
        <p role="alert" className="alert-box">
          {error}
        </p>
      )}

      <Button variant={failed ? "destructive" : "hero"} loading={running} disabled={!canSubmit} onClick={submit}>
        {error ? <FaRedoAlt aria-hidden="true" className="mr-2 inline" /> : failed ? <FaExclamationTriangle aria-hidden="true" className="mr-2 inline" /> : <FaCheck aria-hidden="true" className="mr-2 inline" />}
        {error ? "Coba lagi" : failed ? "Kirim laporan gagal" : "Kirim bukti & selesai"}
      </Button>
      <Button variant="secondary" disabled={running} onClick={onCancel}>
        <FaTimes aria-hidden="true" className="mr-2 inline" />
        Batal
      </Button>
    </section>
  );
}
