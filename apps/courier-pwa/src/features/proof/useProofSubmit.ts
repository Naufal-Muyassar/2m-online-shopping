import { useRef, useState } from "react";
import axios from "axios";
import type { FailedReason, ProofRegisterResponse, ProofUploadUrlResponse } from "@2m/shared";
import { api } from "@/lib/api";
import { getFreshFix } from "@/platform/geo";
import { useOrderStatus } from "@/features/tasks/hooks";
import { compressImage } from "./compress";

export const STEPS = ["Memproses foto", "Mengambil lokasi", "Mengunggah foto", "Menyimpan bukti", "Mengirim status"] as const;

export interface SubmitInput {
  file: File;
  to: "DELIVERED" | "FAILED";
  reason?: FailedReason;
  note?: string;
}

interface Resume {
  blob?: Blob;
  fix?: { lat: number; lng: number; accuracy: number };
  photoKey?: string;
  uploaded?: boolean;
  registered?: boolean;
  idempotencyKey: string;
}

// Linear proof flow: compress → GPS → signed URL → PUT → register → status.
// A failed run resumes from the failed step; the idempotency key is reused until success.
export function useProofSubmit(orderId: string) {
  const statusMutation = useOrderStatus();
  const resume = useRef<Resume>({ idempotencyKey: crypto.randomUUID() });
  const [step, setStep] = useState(-1);
  const [uploadPct, setUploadPct] = useState(0);
  const [running, setRunning] = useState(false);

  const reset = () => {
    resume.current = { idempotencyKey: crypto.randomUUID() };
    setStep(-1);
    setUploadPct(0);
  };

  const run = async (input: SubmitInput) => {
    const r = resume.current;
    setRunning(true);
    try {
      if (!r.blob) {
        setStep(0);
        r.blob = await compressImage(input.file);
      }
      if (!r.fix) {
        setStep(1);
        r.fix = await getFreshFix();
      }
      if (!r.uploaded) {
        setStep(2);
        if (!r.photoKey) {
          const { data } = await api.post<ProofUploadUrlResponse>(`/courier/orders/${orderId}/proof/upload-url`);
          r.photoKey = data.photo_key;
          await axios.put(data.upload_url, r.blob, {
            headers: { "Content-Type": "image/jpeg" },
            onUploadProgress: (e) => setUploadPct(e.total ? Math.round((e.loaded / e.total) * 100) : 0),
          });
        }
        r.uploaded = true;
      }
      if (!r.registered) {
        setStep(3);
        await api.post<ProofRegisterResponse>(`/courier/orders/${orderId}/proof`, {
          photo_key: r.photoKey,
          lat: r.fix.lat,
          lng: r.fix.lng,
        });
        r.registered = true;
      }
      setStep(4);
      const fix = await getFreshFix();
      await statusMutation.mutateAsync({
        orderId,
        body: {
          to: input.to,
          lat: fix.lat,
          lng: fix.lng,
          accuracy: fix.accuracy,
          client_ts: new Date().toISOString(),
          idempotency_key: r.idempotencyKey,
          reason: input.reason,
          note: input.note || undefined,
        },
      });
      reset();
    } catch (err) {
      // An upload that failed midway must be re-signed on the next try.
      if (!r.uploaded) r.photoKey = undefined;
      throw err;
    } finally {
      setRunning(false);
    }
  };

  return { run, reset, step, uploadPct, running };
}
