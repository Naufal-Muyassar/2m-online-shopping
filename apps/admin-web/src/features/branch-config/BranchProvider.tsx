import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AdminBranch, SuperBranch, SuperBranchesResponse } from "@2m/shared";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";

interface BranchState {
  branchId: string | null;
  branchName: string | null;
  branches: AdminBranch[];
  setBranchId: (id: string) => void;
}

const BranchContext = createContext<BranchState | null>(null);

// Invalidate this after a branch is created or edited, so the switcher and the map pick it up.
export const BRANCH_CONTEXT_KEY = "branch-context";

export function useBranch(): BranchState {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranch outside BranchProvider");
  return ctx;
}

const fetchAllBranches = async (): Promise<SuperBranch[]> => (await api.get<SuperBranchesResponse>("/admin/branches")).data.branches;

// super_admin only: every branch with its admins. Shares the cache entry the switcher reads.
export function useAllBranches() {
  return useQuery({ queryKey: [BRANCH_CONTEXT_KEY, true], queryFn: fetchAllBranches });
}

// branch_admin is pinned to the token's branch; super_admin picks one, closed branches included.
export function BranchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isSuper = user?.role === "super_admin";
  const [selected, setSelected] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: [BRANCH_CONTEXT_KEY, isSuper],
    queryFn: async (): Promise<AdminBranch[]> =>
      isSuper ? fetchAllBranches() : [(await api.get<AdminBranch>("/admin/branch")).data],
  });
  const branches = data ?? [];

  useEffect(() => {
    if (isSuper && !selected && branches.length > 0) setSelected(branches[0]!.id);
  }, [isSuper, selected, branches]);

  const branchId = isSuper ? selected : (user?.branch_id ?? null);
  const branchName = branches.find((b) => b.id === branchId)?.name ?? null;
  return (
    <BranchContext.Provider value={{ branchId, branchName, branches, setBranchId: setSelected }}>{children}</BranchContext.Provider>
  );
}
