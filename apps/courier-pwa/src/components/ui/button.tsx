import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "destructive";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground border border-border",
  destructive: "bg-destructive text-destructive-foreground",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

export function Button({ variant = "primary", loading, disabled, className, children, ...rest }: Props) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        "min-h-14 w-full rounded-lg px-4 text-lg font-semibold transition active:scale-[0.99] disabled:opacity-50",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? "Memproses…" : children}
    </button>
  );
}
