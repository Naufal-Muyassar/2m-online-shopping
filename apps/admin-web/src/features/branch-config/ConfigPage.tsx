import { useState, type CSSProperties } from "react";
import { Segmented, useSwapX, type SegmentedItem } from "../../components/Segmented";
import { useAuth } from "../../lib/auth";
import { cn } from "../../lib/utils";
import { useBranch } from "./BranchProvider";
import { BranchesSection } from "./BranchesSection";
import { CatalogSection } from "./CatalogSection";
import { LocationSection } from "./LocationSection";
import { ProductsSection } from "./ProductsSection";

type Section = "products" | "location" | "catalog" | "branches";

const INTRO: Partial<Record<Section, string>> = {
  catalog: "Semua SKU yang bisa dijual cabang. Detail di sini berlaku di semua cabang.",
  branches: "Buka cabang baru dan buat akun admin cabangnya.",
};

export function ConfigPage() {
  const { user } = useAuth();
  const { branchId, branchName } = useBranch();
  const isSuper = user?.role === "super_admin";
  const [section, setSection] = useState<Section>("products");

  // Produk and Lokasi follow the selected branch; Katalog and Cabang cover every branch.
  const items: SegmentedItem<Section>[] = [
    { id: "products", label: "Produk", title: "Produk, harga dan stok cabang" },
    { id: "location", label: "Lokasi", title: "Lokasi dan jangkauan cabang" },
    ...(isSuper
      ? [
          { id: "catalog" as const, label: "Katalog", title: "Katalog produk semua cabang" },
          { id: "branches" as const, label: "Cabang", title: "Semua cabang dan akun admin" },
        ]
      : []),
  ];
  const swapX = useSwapX(items.findIndex((i) => i.id === section));
  const allBranches = section === "catalog" || section === "branches";

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-col gap-2">
        <h1 className="t-headline">Config</h1>
        <p className="text-muted-foreground">{INTRO[section] ?? `Pengaturan untuk ${branchName ?? "cabang ini"}.`}</p>
      </div>
      <Segmented
        label="Bagian config"
        value={section}
        onChange={setSection}
        items={items}
        className={cn("w-full", isSuper ? "sm:w-[30rem]" : "sm:w-80")}
      />
      <div key={section} className="swap-in min-w-0" style={{ "--swap-x": swapX } as CSSProperties}>
        {allBranches && isSuper ? (
          section === "catalog" ? (
            <CatalogSection />
          ) : (
            <BranchesSection />
          )
        ) : !branchId ? (
          <p className="text-sm text-muted-foreground">Pilih cabang…</p>
        ) : section === "products" ? (
          <ProductsSection key={branchId} />
        ) : (
          <LocationSection key={branchId} />
        )}
      </div>
    </div>
  );
}
