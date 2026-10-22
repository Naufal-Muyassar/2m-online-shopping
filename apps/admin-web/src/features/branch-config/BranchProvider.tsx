import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { BranchesResponse } from "@2m/shared";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";

interface BranchState {
  branchId: string | null;
  branches: BranchesResponse["branches"];
  setBranchId: (id: string) => void;
}

const BranchContext = createContext<BranchState | null>(null);

export function useBranch(): BranchState {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranch outside BranchProvider");
  return ctx;
}

// branch_admin is pinned to the token's branch; super_admin picks one.
export function BranchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isSuper = user?.role === "super_admin";
  const [selected, setSelected] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["branches"],
    enabled: isSuper,
    queryFn: async () => (await api.get<BranchesResponse>("/branches")).data,
  });
  const branches = data?.branches ?? [];

  useEffect(() => {
    if (isSuper && !selected && branches.length > 0) setSelected(branches[0]!.id);
  }, [isSuper, selected, branches]);

  const branchId = isSuper ? selected : (user?.branch_id ?? null);
  return <BranchContext.Provider value={{ branchId, branches, setBranchId: setSelected }}>{children}</BranchContext.Provider>;
}
