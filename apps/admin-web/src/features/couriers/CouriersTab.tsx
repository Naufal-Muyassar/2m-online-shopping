import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../lib/toast";
import { cn } from "../../lib/utils";
import { useBranch } from "../branch-config/BranchProvider";
import { COURIER_LABELS, isOnline, useBranchCouriers } from "./hooks";

const COURIER_PILL: Record<string, string> = {
  IDLE: "pill-success",
  DELIVERING: "pill-primary",
  OFFLINE: "",
};

const ORDER_LABELS: Record<string, string> = {
  ACCEPTED: "Menunggu kurir",
  PICKING: "Disiapkan",
  ON_DELIVERY: "Diantar",
  DELIVERED: "Terkirim",
  FAILED: "Gagal kirim",
  CANCELLED: "Dibatalkan",
};

const ORDER_PILL: Record<string, string> = {
  ACCEPTED: "pill-info",
  PICKING: "pill-warning",
  ON_DELIVERY: "pill-primary",
  DELIVERED: "pill-success",
  FAILED: "pill-danger",
  CANCELLED: "pill-danger",
};

function pingAge(iso: string | null): string {
  if (!iso) return "-";
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec} dtk`;
  if (sec < 3600) return `${Math.floor(sec / 60)} mnt`;
  return `${Math.floor(sec / 3600)} jam`;
}

export function CouriersTab({ onOpenChat }: { onOpenChat: (courierId: string) => void }) {
  const { user } = useAuth();
  const { branchId } = useBranch();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isBranchAdmin = user?.role === "branch_admin";

  const { data, isLoading, isError, error } = useBranchCouriers();

  const confirmReturn = useMutation({
    mutationFn: async (orderId: string) => api.post(`/admin/orders/${orderId}/confirm-return`),
    onSuccess: () => {
      toast("success", "Barang kembali dikonfirmasi");
      void queryClient.invalidateQueries({ queryKey: ["admin-couriers", branchId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-orders", branchId] });
    },
    onError: (err) => toast("error", errorMessage(err)),
  });

  if (!branchId) return <p className="p-4 text-sm text-muted-foreground md:p-6">Pilih cabang…</p>;
  if (isLoading)
    return (
      <div className="space-y-3 p-4 md:p-6" role="status" aria-busy="true" aria-label="Memuat">
        <div className="skeleton h-10 w-48" />
        <div className="skeleton h-14" />
        <div className="skeleton h-14" />
        <div className="skeleton h-14" />
      </div>
    );
  if (isError)
    return (
      <div className="p-4 md:p-6">
        <p className="alert-box" role="alert">
          {errorMessage(error)}
        </p>
      </div>
    );

  const couriers = data?.couriers ?? [];
  const showCluster = couriers.some((c) => c.motor_cluster != null);
  const online = couriers.filter(isOnline).length;

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <div className="flex items-end justify-between gap-4">
        <h1 className="t-headline">Kurir</h1>
        <p className="t-label pb-1 tabular-nums">
          {online} dari {couriers.length} kurir online
        </p>
      </div>
      {couriers.length > 0 && (
        <div className="card animate-rise overflow-hidden p-0 md:p-0">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Partner</th>
                {showCluster && <th>Motor</th>}
                <th>Status</th>
                <th>Ping terakhir</th>
                <th>Order</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {couriers.map((c) => {
                const order = c.current_order;
                return (
                  <tr key={c.user_id}>
                    <td data-primary>
                      <span className="flex items-center gap-3 font-bold">
                        <span className={cn("avatar size-9 text-sm", c.status === "OFFLINE" && "grayscale")} aria-hidden="true">
                          {c.name.charAt(0)}
                        </span>
                        {c.name}
                      </span>
                    </td>
                    <td data-label="Partner">{c.partner_name}</td>
                    {showCluster && <td data-label="Motor">{c.motor_cluster ?? "-"}</td>}
                    <td data-label="Status">
                      <span className={cn("pill pill-dot", COURIER_PILL[c.status])}>{COURIER_LABELS[c.status]}</span>
                    </td>
                    <td data-label="Ping terakhir" className="tabular-nums">
                      {pingAge(c.last_ping_at)}
                    </td>
                    <td data-label="Order">
                      {order ? (
                        <span className="inline-flex flex-wrap items-center justify-end gap-2 md:justify-start">
                          <span className="font-semibold tabular-nums">{order.code}</span>
                          <span className={cn("pill", ORDER_PILL[order.status])}>{ORDER_LABELS[order.status] ?? order.status}</span>
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td data-actions className="md:whitespace-nowrap md:text-right">
                      <span className="inline-flex flex-wrap gap-2 md:justify-end">
                        {isBranchAdmin && order?.status === "FAILED" && (
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={confirmReturn.isPending && confirmReturn.variables === order.id}
                            onClick={() => confirmReturn.mutate(order.id)}
                          >
                            Konfirmasi barang kembali
                          </button>
                        )}
                        <button className="btn btn-secondary btn-sm" onClick={() => onOpenChat(c.user_id)}>
                          Chat
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {couriers.length === 0 && (
        <div className="empty-state">
          <p>Belum ada kurir.</p>
        </div>
      )}
    </div>
  );
}
