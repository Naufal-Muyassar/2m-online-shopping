import { useQuery } from "@tanstack/react-query";
import type { AdminCourier, AdminCouriersResponse } from "@2m/shared";
import { api } from "../../lib/api";
import { useBranch } from "../branch-config/BranchProvider";

export function useBranchCouriers(pollMs = 10_000) {
  const { branchId } = useBranch();
  return useQuery({
    queryKey: ["admin-couriers", branchId],
    enabled: !!branchId,
    refetchInterval: pollMs,
    queryFn: async () =>
      (await api.get<AdminCouriersResponse>("/admin/couriers", { params: { branch_id: branchId } })).data,
  });
}

export const isOnline = (courier: AdminCourier) => courier.status !== "OFFLINE";

export const COURIER_LABELS: Record<AdminCourier["status"], string> = {
  IDLE: "Siap",
  DELIVERING: "Mengantar",
  OFFLINE: "Offline",
};
