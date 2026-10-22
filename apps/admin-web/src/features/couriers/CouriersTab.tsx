import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminCourier, AdminCouriersResponse } from "@2m/shared";
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

function ReassignDialog({
  orderId,
  orderCode,
  idleCouriers,
  onClose,
}: {
  orderId: string;
  orderCode: string;
  idleCouriers: AdminCourier[];
  onClose: () => void;
}) {
  const { branchId } = useBranch();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [target, setTarget] = useState("");

  const reassign = useMutation({
    mutationFn: async () =>
      api.patch(`/orders/${orderId}/reassign`, {
        ...(target ? { courier_id: target } : {}),
        idempotency_key: crypto.randomUUID(),
      }),
    onSuccess: () => {
      toast("success", `${orderCode} di-reassign`);
      void queryClient.invalidateQueries({ queryKey: ["admin-couriers", branchId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-orders", branchId] });
      onClose();
    },
    onError: (err) => toast("error", errorMessage(err)),
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm space-y-4 rounded-lg bg-background p-5 shadow-lg">
        <h2 className="text-lg font-semibold">Reassign {orderCode}</h2>
        <label className="block text-sm">
          Kurir tujuan
          <select
            className="mt-1 w-full rounded-md border px-3 py-2"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="">Otomatis (antrean kurir terlama idle)</option>
            {idleCouriers.map((c) => (
              <option key={c.user_id} value={c.user_id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {reassign.isError && <p className="text-sm text-destructive">{errorMessage(reassign.error)}</p>}
        <div className="flex justify-end gap-2">
          <button className="rounded-md border px-3 py-1.5" onClick={onClose} disabled={reassign.isPending}>
            Batal
          </button>
          <button
            className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground disabled:opacity-60"
            onClick={() => reassign.mutate()}
            disabled={reassign.isPending}
          >
            {reassign.isPending ? "Memproses…" : "Reassign"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CouriersTab() {
  const { user } = useAuth();
  const { branchId } = useBranch();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isBranchAdmin = user?.role === "branch_admin";
  const [reassigning, setReassigning] = useState<{ id: string; code: string } | null>(null);

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
  const idle = couriers.filter((c) => c.status === "IDLE");

  return (
    <div className="p-4">
      <table className="w-full text-left text-sm">
        <thead className="border-b text-xs uppercase text-muted-foreground">
          <tr>
            <th className="py-2">Nama</th>
            <th>Partner</th>
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
                <td>{c.status}</td>
                <td>{pingAge(c.last_ping_at)}</td>
                <td>{order ? `${order.code} (${order.status})` : "-"}</td>
                <td className="space-x-2 text-right">
                  {isBranchAdmin && order?.status === "ASSIGNED" && (
                    <button
                      className="rounded border px-2 py-1"
                      onClick={() => setReassigning({ id: order.id, code: order.code })}
                    >
                      Reassign
                    </button>
                  )}
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
      {reassigning && (
        <ReassignDialog
          orderId={reassigning.id}
          orderCode={reassigning.code}
          idleCouriers={idle}
          onClose={() => setReassigning(null)}
        />
      )}
    </div>
  );
}
