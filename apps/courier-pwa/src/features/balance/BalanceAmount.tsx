import { formatIDR } from "@2m/shared";
import { Skeleton } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { useBalance } from "./hooks";

// Shows an amount only once the server has given one: never a 0 while loading or after an error.
export function BalanceAmount({ className }: { className?: string }) {
  const balance = useBalance();
  if (balance.data) return <span className={cn("shrink-0 font-extrabold tabular-nums tracking-tight", className)}>{formatIDR(balance.data.balance)}</span>;
  if (balance.isError) return <span className="shrink-0 text-sm font-medium">Gagal memuat</span>;
  return <Skeleton className="h-5 w-20 shrink-0" />;
}
