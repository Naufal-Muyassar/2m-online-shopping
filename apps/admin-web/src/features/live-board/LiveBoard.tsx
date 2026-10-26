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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm space-y-4 rounded-lg bg-background p-5 shadow-lg">
        <h2 className="text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

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
      <label className="block text-sm">
        Kurir (IDLE)
        <select
          className="mt-1 w-full rounded-md border px-3 py-2"
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
      {couriers.isError && <p className="text-sm text-destructive">{errorMessage(couriers.error)}</p>}
      {couriers.isSuccess && idle.length === 0 && <p className="text-sm text-muted-foreground">Tidak ada kurir IDLE.</p>}
      {assign.isError && <p className="text-sm text-destructive">{errorMessage(assign.error)}</p>}
      <div className="flex justify-end gap-2">
        <button className="rounded-md border px-3 py-1.5" onClick={onClose} disabled={assign.isPending}>
          Batal
        </button>
        <button
          className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground disabled:opacity-60"
          onClick={() => assign.mutate()}
          disabled={assign.isPending || !target}
        >
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
      <label className="block text-sm">
        Alasan
        <textarea
          className="mt-1 w-full rounded-md border px-3 py-2"
          maxLength={200}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={release.isPending}
        />
      </label>
      {release.isError && <p className="text-sm text-destructive">{errorMessage(release.error)}</p>}
      <div className="flex justify-end gap-2">
        <button className="rounded-md border px-3 py-1.5" onClick={onClose} disabled={release.isPending}>
          Batal
        </button>
        <button
          className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground disabled:opacity-60"
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

  const buttonClass = "mt-2 w-full rounded px-2 py-1 disabled:opacity-60";

  return (
    <li className={cn("rounded-md border bg-background p-3 text-sm shadow-sm", late && "border-destructive bg-red-50")}>
      <div className="flex justify-between font-medium">
        <span>{order.code}</span>
        <span>{formatIDR(order.grand_total)}</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {age} mnt di status ini{late ? " · melewati SLA" : ""}
      </div>
      {(column === "PICKING" || column === "ON_DELIVERY") && order.assigned_courier && (
        <div className="mt-1 text-xs">Kurir: {order.assigned_courier.name}</div>
      )}
      {isBranchAdmin && column === "PAID" && (
        <button
          className={cn(buttonClass, "bg-primary text-primary-foreground")}
          disabled={accept.isPending}
          onClick={() => accept.mutate()}
        >
          {accept.isPending ? "Memproses…" : "Terima"}
        </button>
      )}
      {isBranchAdmin && column === "ACCEPTED" && (
        <button className={cn(buttonClass, "border border-primary text-primary")} onClick={() => setDialog("assign")}>
          Tugaskan manual
        </button>
      )}
      {isBranchAdmin && column === "PICKING" && (
        <button className={cn(buttonClass, "border border-primary text-primary")} onClick={() => setDialog("release")}>
          Lepas kurir
        </button>
      )}
      {accept.isError && <p className="mt-1 text-xs text-destructive">{errorMessage(accept.error)}</p>}
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
    <section className="rounded-lg border bg-secondary p-3">
      <h3 className="mb-2 text-sm font-semibold">Menunggu pembayaran ({orders.length})</h3>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {orders.map((o) => (
          <li key={o.id} className="rounded-md border bg-background p-3 text-sm">
            <div className="flex justify-between font-medium">
              <span>{o.code}</span>
              <span>{formatIDR(o.grand_total)}</span>
            </div>
            {demoMode && (
              <button
                className="mt-2 w-full rounded border border-primary px-2 py-1 text-primary disabled:opacity-60"
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
  if (isLoading) return <p className="p-4 text-sm">Memuat…</p>;
  if (isError) return <p className="p-4 text-sm text-destructive">{errorMessage(error)}</p>;

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
            <section key={col} className="rounded-lg bg-secondary p-2">
              <h3 className="mb-2 text-sm font-semibold">
                {COLUMN_LABELS[col]} ({items.length})
              </h3>
              <ul className="space-y-2">
                {items.map((o) => (
                  <OrderCard key={o.id} order={o} column={col} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <details className="rounded-lg bg-secondary p-3">
        <summary className="cursor-pointer text-sm font-semibold">Selesai ({done.length})</summary>
        <ul className="mt-2 space-y-1 text-sm">
          {done.map((o) => (
            <li key={o.id} className="flex justify-between">
              <span>
                {o.code} · {o.status}
              </span>
              <span>{formatIDR(o.grand_total)}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
