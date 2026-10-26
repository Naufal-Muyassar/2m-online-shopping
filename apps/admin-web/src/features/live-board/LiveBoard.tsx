import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  TERMINAL_STATUSES,
  formatIDR,
  type AdminCouriersResponse,
  type AdminOrder,
  type AdminOrdersResponse,
  type MetaConfigResponse,
} from "@2m/shared";
import { api, errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../lib/toast";
import { cn } from "../../lib/utils";
import { useBranch } from "../branch-config/BranchProvider";
import { BOARD_COLUMNS, BOARD_POLL_MS, COLUMN_LABELS, SLA_MINUTES, ageMinutes, type BoardColumn } from "./constants";

export const BOARD_KEY = "admin-orders";

function useRefreshBoard() {
  const { branchId } = useBranch();
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: [BOARD_KEY, branchId] });
    void queryClient.invalidateQueries({ queryKey: ["admin-couriers", branchId] });
  };
}

function Dialog({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-40 flex animate-fade-in items-center justify-center bg-foreground/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="card w-full max-w-sm animate-rise space-y-4 p-5 shadow-lg">
        <h2 className="text-lg font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

const SECONDARY_BTN = "min-h-11 rounded-md border bg-surface px-4 py-2 font-medium hover:bg-muted disabled:opacity-60";
const PRIMARY_BTN =
  "min-h-11 rounded-md bg-primary px-4 py-2 font-bold text-primary-foreground hover:bg-primary-pressed disabled:opacity-60";

const ORDER_PILL: Record<string, string> = {
  ACCEPTED: "pill-info",
  PICKING: "pill-warning",
  ON_DELIVERY: "pill-primary",
  DELIVERED: "pill-success",
  FAILED: "pill-danger",
  CANCELLED: "pill-danger",
};

function AssignDialog({ order, onClose }: { order: AdminOrder; onClose: () => void }) {
  const { branchId } = useBranch();
  const toast = useToast();
  const refresh = useRefreshBoard();
  const [target, setTarget] = useState("");
  const couriers = useQuery({
    queryKey: ["admin-couriers", branchId],
    enabled: !!branchId,
    queryFn: async () =>
      (await api.get<AdminCouriersResponse>("/admin/couriers", { params: { branch_id: branchId } })).data,
  });
  const idle = couriers.data?.couriers.filter((c) => c.status === "IDLE") ?? [];

  const assign = useMutation({
    mutationFn: async () =>
      api.post(`/admin/orders/${order.id}/assign`, { courier_id: target, idempotency_key: crypto.randomUUID() }),
    onSuccess: () => {
      toast("success", `${order.code} ditugaskan`);
      refresh();
      onClose();
    },
    onError: (err) => toast("error", errorMessage(err)),
  });

  return (
    <Dialog title={`Tugaskan ${order.code}`}>
      <label className="field-label block">
        Kurir (IDLE)
        <select
          className="field mt-1"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          disabled={couriers.isLoading}
        >
          <option value="">Pilih kurir…</option>
          {idle.map((c) => (
            <option key={c.user_id} value={c.user_id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {couriers.isError && (
        <p className="alert-box" role="alert">
          {errorMessage(couriers.error)}
        </p>
      )}
      {couriers.isSuccess && idle.length === 0 && <p className="notice">Tidak ada kurir IDLE.</p>}
      {assign.isError && (
        <p className="alert-box" role="alert">
          {errorMessage(assign.error)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button className={SECONDARY_BTN} onClick={onClose} disabled={assign.isPending}>
          Batal
        </button>
        <button className={PRIMARY_BTN} onClick={() => assign.mutate()} disabled={assign.isPending || !target}>
          {assign.isPending ? "Memproses…" : "Tugaskan"}
        </button>
      </div>
    </Dialog>
  );
}

function ReleaseDialog({ order, onClose }: { order: AdminOrder; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefreshBoard();
  const [reason, setReason] = useState("");

  const release = useMutation({
    mutationFn: async () =>
      api.post(`/admin/orders/${order.id}/release`, { reason: reason.trim(), idempotency_key: crypto.randomUUID() }),
    onSuccess: () => {
      toast("success", `${order.code} kembali ke Menunggu kurir`);
      refresh();
      onClose();
    },
    onError: (err) => toast("error", errorMessage(err)),
  });

  return (
    <Dialog title={`Lepas kurir dari ${order.code}?`}>
      <p className="text-sm text-muted-foreground">
        Order kembali ke "Menunggu kurir"{order.assigned_courier ? ` dan ${order.assigned_courier.name} menjadi IDLE` : ""}.
      </p>
      <label className="field-label block">
        Alasan
        <textarea
          className="field mt-1"
          maxLength={200}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={release.isPending}
        />
      </label>
      {release.isError && (
        <p className="alert-box" role="alert">
          {errorMessage(release.error)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button className={SECONDARY_BTN} onClick={onClose} disabled={release.isPending}>
          Batal
        </button>
        <button
          className="min-h-11 rounded-md bg-destructive px-4 py-2 font-bold text-destructive-foreground hover:opacity-90 disabled:opacity-60"
          onClick={() => release.mutate()}
          disabled={release.isPending || reason.trim() === ""}
        >
          {release.isPending ? "Memproses…" : "Lepas kurir"}
        </button>
      </div>
    </Dialog>
  );
}

function OrderCard({ order, column }: { order: AdminOrder; column: BoardColumn }) {
  const { user } = useAuth();
  const toast = useToast();
  const refresh = useRefreshBoard();
  const [dialog, setDialog] = useState<"assign" | "release" | null>(null);
  const age = ageMinutes(order.last_transition_at ?? order.created_at, Date.now());
  const late = age > SLA_MINUTES[column];
  const isBranchAdmin = user?.role === "branch_admin";

  const accept = useMutation({
    mutationFn: async () =>
      api.post(`/admin/orders/${order.id}/transition`, { to: "ACCEPTED", idempotency_key: crypto.randomUUID() }),
    onSuccess: () => {
      toast("success", `${order.code} diterima`);
      refresh();
    },
    onError: (err) => toast("error", errorMessage(err)),
  });

  const buttonClass = "mt-3 w-full min-h-11 rounded-md px-3 py-2 font-bold disabled:opacity-60";

  return (
    <li className={cn("card p-3 text-sm shadow-md", late && "border-destructive bg-destructive-surface")}>
      <div className="flex justify-between gap-2 font-bold">
        <span>{order.code}</span>
        <span>{formatIDR(order.grand_total)}</span>
      </div>
      <div className={cn("mt-1 text-xs", late ? "font-medium text-destructive" : "text-muted-foreground")}>
        {age} mnt di status ini{late ? " · melewati SLA" : ""}
      </div>
      {(column === "PICKING" || column === "ON_DELIVERY") && order.assigned_courier && (
        <div className="mt-2">
          <span className={cn("pill pill-dot", ORDER_PILL[column])}>Kurir: {order.assigned_courier.name}</span>
        </div>
      )}
      {isBranchAdmin && column === "PAID" && (
        <button
          className={cn(buttonClass, "bg-primary text-primary-foreground hover:bg-primary-pressed")}
          disabled={accept.isPending}
          onClick={() => accept.mutate()}
        >
          {accept.isPending ? "Memproses…" : "Terima"}
        </button>
      )}
      {isBranchAdmin && column === "ACCEPTED" && (
        <button className={cn(buttonClass, "border bg-surface hover:bg-muted")} onClick={() => setDialog("assign")}>
          Tugaskan manual
        </button>
      )}
      {isBranchAdmin && column === "PICKING" && (
        <button
          className={cn(buttonClass, "bg-destructive-surface text-destructive hover:bg-destructive hover:text-destructive-foreground")}
          onClick={() => setDialog("release")}
        >
          Lepas kurir
        </button>
      )}
      {accept.isError && (
        <p className="alert-box mt-2" role="alert">
          {errorMessage(accept.error)}
        </p>
      )}
      {dialog === "assign" && <AssignDialog order={order} onClose={() => setDialog(null)} />}
      {dialog === "release" && <ReleaseDialog order={order} onClose={() => setDialog(null)} />}
    </li>
  );
}

function PendingPayment({ orders }: { orders: AdminOrder[] }) {
  const { branchId } = useBranch();
  const toast = useToast();
  const queryClient = useQueryClient();
  const demoMode = useQuery({
    queryKey: ["meta-config"],
    queryFn: async () => (await api.get<MetaConfigResponse>("/meta/config")).data,
    staleTime: Infinity,
  }).data?.demo_mode === true;
  const forcePaid = useMutation({
    mutationFn: async (id: string) =>
      api.post(`/admin/orders/${id}/force-paid`, { idempotency_key: crypto.randomUUID() }),
    onSuccess: () => {
      toast("success", "Order ditandai PAID");
      void queryClient.invalidateQueries({ queryKey: [BOARD_KEY, branchId] });
    },
    onError: (err) => toast("error", errorMessage(err)),
  });

  return (
    <section className="card p-3">
      <h3 className="eyebrow mb-3">Menunggu pembayaran ({orders.length})</h3>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {orders.map((o) => (
          <li key={o.id} className="rounded-md border bg-surface p-3 text-sm shadow-sm">
            <div className="flex justify-between font-bold">
              <span>{o.code}</span>
              <span>{formatIDR(o.grand_total)}</span>
            </div>
            {demoMode && (
              <button
                className="mt-3 min-h-11 w-full rounded-md bg-destructive px-3 py-2 font-bold text-destructive-foreground hover:opacity-90 disabled:opacity-60"
                disabled={forcePaid.isPending && forcePaid.variables === o.id}
                onClick={() => forcePaid.mutate(o.id)}
              >
                Tandai PAID (demo)
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LiveBoard() {
  const { user } = useAuth();
  const { branchId } = useBranch();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: [BOARD_KEY, branchId],
    enabled: !!branchId,
    refetchInterval: BOARD_POLL_MS,
    queryFn: async () =>
      (await api.get<AdminOrdersResponse>("/admin/orders", { params: { branch_id: branchId } })).data,
  });

  if (!branchId) return <p className="p-4 text-sm text-muted-foreground">Pilih cabang…</p>;
  if (isLoading)
    return (
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4" role="status" aria-busy="true" aria-label="Memuat">
        {BOARD_COLUMNS.map((col) => (
          <div key={col} className="skeleton h-48" />
        ))}
      </div>
    );
  if (isError)
    return (
      <div className="p-4">
        <p className="alert-box" role="alert">
          {errorMessage(error)}
        </p>
      </div>
    );

  const orders = data?.orders ?? [];
  const done = orders.filter((o) => TERMINAL_STATUSES.includes(o.status));
  const pending = orders.filter((o) => o.status === "PENDING_PAYMENT");

  return (
    <div className="space-y-4 p-4">
      {user?.role === "super_admin" && pending.length > 0 && <PendingPayment orders={pending} />}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {BOARD_COLUMNS.map((col) => {
          const items = orders.filter((o) => o.status === col);
          return (
            <section key={col} className="animate-rise rounded-lg bg-muted/50 p-3">
              <h3 className="mb-3 flex items-center justify-between text-sm font-bold">
                <span className={cn("pill pill-dot", ORDER_PILL[col] ?? "pill-info")}>{COLUMN_LABELS[col]}</span>
                <span className="text-muted-foreground">{items.length}</span>
              </h3>
              <ul className="space-y-3">
                {items.map((o) => (
                  <OrderCard key={o.id} order={o} column={col} />
                ))}
              </ul>
              {items.length === 0 && (
                <div className="empty-state p-4 text-sm">
                  <p>Kosong</p>
                </div>
              )}
            </section>
          );
        })}
      </div>
      <details className="card p-3">
        <summary className="cursor-pointer text-sm font-bold">Selesai ({done.length})</summary>
        <ul className="mt-3 space-y-2 text-sm">
          {done.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-2 border-b pb-2 last:border-b-0">
              <span className="inline-flex flex-wrap items-center gap-2">
                {o.code}
                <span className={cn("pill", ORDER_PILL[o.status])}>{o.status}</span>
              </span>
              <span className="font-medium">{formatIDR(o.grand_total)}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
