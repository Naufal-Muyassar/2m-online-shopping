import type { ComponentType, SVGProps } from "react";
import {
  IconCan,
  IconDrink,
  IconEgg,
  IconFlour,
  IconHousehold,
  IconLeaf,
  IconNoodle,
  IconOil,
  IconPackage,
  IconRice,
  IconSnack,
  IconSpice,
} from "./Icons";

const ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  beras: IconRice,
  bumbu: IconSpice,
  kaleng: IconCan,
  mie: IconNoodle,
  minuman: IconDrink,
  minyak: IconOil,
  "rumah tangga": IconHousehold,
  sayur: IconLeaf,
  snack: IconSnack,
  telur: IconEgg,
  tepung: IconFlour,
};

const TINTS = [
  "bg-primary-surface text-primary",
  "bg-warning-surface text-warning",
  "bg-success-surface text-success",
  "bg-promo-surface text-promo",
];

export function categoryTint(category: string): string {
  const sum = [...category].reduce((n, ch) => n + ch.charCodeAt(0), 0);
  return TINTS[sum % TINTS.length] ?? TINTS[0]!;
}

export function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const Icon = ICONS[category.toLowerCase()] ?? IconPackage;
  return <Icon className={className} />;
}
