import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminCouriersResponse } from "@2m/shared";
import { api, errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../lib/toast";
import { useBranch } from "../branch-config/BranchProvider";

const POLL_MS = 10_000;

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
  if (isLoading) return <p className="p-4 text-sm">Memuat…</p>;
  if (isError) return <p className="p-4 text-sm text-destructive">{errorMessage(error)}</p>;

  const couriers = data?.couriers ?? [];
  const showCluster = couriers.some((c) => c.motor_cluster != null);

  return (
    <div className="p-4">
      <table className="w-full text-left text-sm">
        <thead className="border-b text-xs uppercase text-muted-foreground">
          <tr>
            <th className="py-2">Nama</th>
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
              <tr key={c.user_id} className="border-b">
                <td className="py-2 font-medium">{c.name}</td>
                <td>{c.partner_name}</td>
                {showCluster && <td>{c.motor_cluster ?? "-"}</td>}
                <td>{c.status}</td>
                <td>{pingAge(c.last_ping_at)}</td>
                <td>{order ? `${order.code} (${order.status})` : "-"}</td>
                <td className="space-x-2 text-right">
                  {isBranchAdmin && order?.status === "FAILED" && (
                    <button
                      className="rounded bg-primary px-2 py-1 text-primary-foreground disabled:opacity-60"
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
      {couriers.length === 0 && <p className="py-4 text-sm text-muted-foreground">Belum ada kurir.</p>}
    </div>
  );
}
