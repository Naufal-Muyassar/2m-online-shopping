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

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <dt className="t-label">{label}</dt>
      <dd className={strong ? "mt-0.5 text-lg font-extrabold tabular-nums tracking-tight text-success" : "mt-0.5 font-bold tabular-nums"}>{value}</dd>
    </div>
  );
}

function JobCard({ job, busy, claiming, onClaim, index }: { job: CourierJob; busy: boolean; claiming: boolean; onClaim: () => void; index: number }) {
  return (
    <article className="card animate-rise" style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-lg font-extrabold tabular-nums tracking-tight">{job.code}</span>
        <span className="pill">{timeAgo(job.accepted_at)}</span>
      </div>
      <p className="mt-1 text-muted-foreground">{job.area_hint}</p>
      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border">
        <Stat label="Upah" value={job.courier_wage === null ? "–" : formatIDR(job.courier_wage)} strong />
        <Stat label="Jarak" value={job.route_distance_km === null ? "–" : `${job.route_distance_km} km`} />
        <Stat label="Jumlah item" value={String(job.item_count)} />
        <Stat label="Berat" value={`${job.total_weight_kg} kg`} />
      </dl>
      <Button className="mt-4" loading={claiming} disabled={busy && !claiming} onClick={onClaim}>
        Ambil order
      </Button>
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
