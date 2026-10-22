import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TERMINAL_STATUSES, formatIDR, type AdminOrder, type AdminOrdersResponse } from "@2m/shared";
import { api, errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../lib/toast";
import { cn } from "../../lib/utils";
import { useBranch } from "../branch-config/BranchProvider";
import {
  BOARD_COLUMNS,
  BOARD_POLL_MS,
  COLUMN_LABELS,
  NEXT_ACTION,
  SLA_MINUTES,
  ageMinutes,
  type BoardColumn,
} from "./constants";

export const BOARD_KEY = "admin-orders";

function OrderCard({ order, column }: { order: AdminOrder; column: BoardColumn }) {
  const { user } = useAuth();
  const { branchId } = useBranch();
  const toast = useToast();
  const queryClient = useQueryClient();
  const age = ageMinutes(order.last_transition_at ?? order.created_at, Date.now());
  const late = age > SLA_MINUTES[column];
  const action = user?.role === "branch_admin" ? NEXT_ACTION[order.status] : undefined;

  const transition = useMutation({
    mutationFn: async (to: "ACCEPTED" | "PICKING" | "READY") =>
      api.post(`/admin/orders/${order.id}/transition`, { to, idempotency_key: crypto.randomUUID() }),
    onSuccess: () => {
      toast("success", `${order.code} diperbarui`);
      void queryClient.invalidateQueries({ queryKey: [BOARD_KEY, branchId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-couriers", branchId] });
    },
    onError: (err) => toast("error", errorMessage(err)),
  });

  return (
    <li className={cn("rounded-md border bg-background p-3 text-sm shadow-sm", late && "border-destructive bg-red-50")}>
      <div className="flex justify-between font-medium">
        <span>{order.code}</span>
        <span>{formatIDR(order.grand_total)}</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {age} mnt di status ini{late ? " · melewati SLA" : ""}
      </div>
      {order.assigned_courier && <div className="mt-1 text-xs">Kurir: {order.assigned_courier.name}</div>}
      {action && (
        <button
          className="mt-2 w-full rounded bg-primary px-2 py-1 text-primary-foreground disabled:opacity-60"
          disabled={transition.isPending}
          onClick={() => transition.mutate(action.to)}
        >
          {transition.isPending ? "Memproses…" : action.label}
        </button>
      )}
      {transition.isError && <p className="mt-1 text-xs text-destructive">{errorMessage(transition.error)}</p>}
    </li>
  );
}

function PendingPayment({ orders }: { orders: AdminOrder[] }) {
  const { branchId } = useBranch();
  const toast = useToast();
  const queryClient = useQueryClient();
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
            <button
              className="mt-2 w-full rounded border border-primary px-2 py-1 text-primary disabled:opacity-60"
              disabled={forcePaid.isPending && forcePaid.variables === o.id}
              onClick={() => forcePaid.mutate(o.id)}
            >
              Tandai PAID (demo)
            </button>
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
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
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
