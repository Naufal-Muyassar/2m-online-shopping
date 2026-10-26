import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { formatIDR, type CourierJob } from "@2m/shared";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorCard, LoadingBlock } from "@/components/ui/feedback";
import { FaBoxOpen, FaMoon } from "react-icons/fa";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/api";
import { timeAgo } from "@/lib/utils";
import { getFreshFix } from "@/platform/geo";
import { useClaimJob, useJobs } from "./hooks";

function JobCard({ job, busy, claiming, onClaim, index }: { job: CourierJob; busy: boolean; claiming: boolean; onClaim: () => void; index: number }) {
  return (
    <article className="card animate-rise" style={{ animationDelay: `${Math.min(index, 6) * 70}ms` }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-lg font-bold">{job.code}</span>
        <span className="pill">{timeAgo(job.accepted_at)}</span>
      </div>
      <p className="mt-1 text-base">{job.area_hint}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-base">
        <dt className="text-sm text-muted-foreground">Jarak</dt>
        <dd className="text-right font-semibold">{job.route_distance_km === null ? "–" : `${job.route_distance_km} km`}</dd>
        <dt className="text-sm text-muted-foreground">Jumlah item</dt>
        <dd className="text-right font-semibold">{job.item_count}</dd>
        <dt className="text-sm text-muted-foreground">Berat</dt>
        <dd className="text-right font-semibold">{job.total_weight_kg} kg</dd>
        <dt className="text-sm text-muted-foreground">Upah</dt>
        <dd className="text-right font-bold text-success">{job.courier_wage === null ? "–" : formatIDR(job.courier_wage)}</dd>
      </dl>
      <div className="card-footer">
        <Button variant="hero" loading={claiming} disabled={busy && !claiming} onClick={onClaim}>
          Ambil order
        </Button>
      </div>
    </article>
  );
}

export function JobList() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const jobs = useJobs();
  const claim = useClaimJob();
  // One idempotency_key per job claim action; dropped once the action has a final answer.
  const keys = useRef(new Map<string, string>());

  const onClaim = async (jobId: string) => {
    let key = keys.current.get(jobId);
    if (!key) {
      key = crypto.randomUUID();
      keys.current.set(jobId, key);
    }
    try {
      const fix = await getFreshFix();
      const order = await claim.mutateAsync({
        jobId,
        body: { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, client_ts: new Date().toISOString(), idempotency_key: key },
      });
      keys.current.delete(jobId);
      notify("success", "Order berhasil diambil.");
      navigate(`/orders/${order.id}`);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        keys.current.delete(jobId);
        void jobs.refetch();
      }
      notify("error", errorMessage(err));
    }
  };

  if (jobs.isLoading) return <LoadingBlock />;
  if (jobs.isError) return <ErrorCard message={errorMessage(jobs.error)} onRetry={() => void jobs.refetch()} />;
  if (!jobs.data?.can_claim) {
    return <EmptyState icon={<FaMoon />} title="Status Anda berubah" hint="Muat ulang halaman." />;
  }
  if (jobs.data.jobs.length === 0) {
    return <EmptyState icon={<FaBoxOpen />} title="Belum ada order" hint="Order baru akan muncul di sini." />;
  }
  return (
    <div className="flex flex-col gap-3">
      {jobs.data.jobs.map((job, i) => (
        <JobCard
          key={job.id}
          index={i}
          job={job}
          busy={claim.isPending}
          claiming={claim.isPending && claim.variables?.jobId === job.id}
          onClaim={() => void onClaim(job.id)}
        />
      ))}
    </div>
  );
}
