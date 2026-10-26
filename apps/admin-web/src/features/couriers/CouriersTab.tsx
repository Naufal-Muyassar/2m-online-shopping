import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminCouriersResponse } from "@2m/shared";
import { api, errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../lib/toast";
import { cn } from "../../lib/utils";
import { useBranch } from "../branch-config/BranchProvider";

const POLL_MS = 10_000;

const COURIER_PILL: Record<string, string> = {
  IDLE: "pill-success",
  DELIVERING: "pill-primary",
  OFFLINE: "",
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

export function CouriersTab() {
  const { user } = useAuth();
  const { branchId } = useBranch();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isBranchAdmin = user?.role === "branch_admin";

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-couriers", branchId],
    enabled: !!branchId,
    refetchInterval: POLL_MS,
    queryFn: async () =>
      (await api.get<AdminCouriersResponse>("/admin/couriers", { params: { branch_id: branchId } })).data,
  });

  const confirmReturn = useMutation({
    mutationFn: async (orderId: string) => api.post(`/admin/orders/${orderId}/confirm-return`),
    onSuccess: () => {
      toast("success", "Barang kembali dikonfirmasi");
      void queryClient.invalidateQueries({ queryKey: ["admin-couriers", branchId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-orders", branchId] });
    },
    onError: (err) => toast("error", errorMessage(err)),
  });

  if (!branchId) return <p className="p-4 text-sm text-muted-foreground">Pilih cabang…</p>;
  if (isLoading)
    return (
      <div className="space-y-3 p-4" role="status" aria-busy="true" aria-label="Memuat">
        <div className="skeleton h-12" />
        <div className="skeleton h-12" />
        <div className="skeleton h-12" />
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

  const couriers = data?.couriers ?? [];
  const showCluster = couriers.some((c) => c.motor_cluster != null);

  return (
    <div className="p-4">
      <div className="card animate-rise overflow-x-auto p-0 shadow-md">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Nama</th>
              <th className="px-2">Partner</th>
              {showCluster && <th className="px-2">Motor</th>}
              <th className="px-2">Status</th>
              <th className="px-2">Ping terakhir</th>
              <th className="px-2">Order</th>
              <th className="px-4" />
            </tr>
          </thead>
          <tbody>
            {couriers.map((c) => {
              const order = c.current_order;
              return (
                <tr key={c.user_id} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-bold">{c.name}</td>
                  <td className="px-2">{c.partner_name}</td>
                  {showCluster && <td className="px-2">{c.motor_cluster ?? "-"}</td>}
                  <td className="px-2">
                    <span className={cn("pill pill-dot", COURIER_PILL[c.status])}>{c.status}</span>
                  </td>
                  <td className="px-2">{pingAge(c.last_ping_at)}</td>
                  <td className="px-2">
                    {order ? (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {order.code}
                        <span className={cn("pill", ORDER_PILL[order.status])}>{order.status}</span>
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="space-x-2 px-4 text-right">
                    {isBranchAdmin && order?.status === "FAILED" && (
                      <button
                        className="min-h-11 rounded-md bg-primary px-3 py-2 font-bold text-primary-foreground hover:bg-primary-pressed disabled:opacity-60"
                        disabled={confirmReturn.isPending && confirmReturn.variables === order.id}
                        onClick={() => confirmReturn.mutate(order.id)}
                      >
                        Konfirmasi barang kembali
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {couriers.length === 0 && (
        <div className="empty-state mt-4">
          <p>Belum ada kurir.</p>
        </div>
      )}
    </div>
  );
}
