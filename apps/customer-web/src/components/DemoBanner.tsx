import { useMetaConfig } from "../lib/queries";

export function DemoBanner() {
  const { data } = useMetaConfig();
  if (!data?.demo_mode) return null;
  return (
    <p role="status" className="notice text-center">
      Mode demo: pembayaran disimulasikan
    </p>
  );
}
