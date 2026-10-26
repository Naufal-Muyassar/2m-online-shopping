import { useMetaConfig } from "../lib/queries";

export function DemoBanner() {
  const { data } = useMetaConfig();
  if (!data?.demo_mode) return null;
  return (
    <p role="status" className="rounded-md bg-secondary px-3 py-1.5 text-center text-xs text-muted-foreground">
      Mode demo: pembayaran disimulasikan
    </p>
  );
}
