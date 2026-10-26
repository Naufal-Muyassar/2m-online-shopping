import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "hero" | "secondary" | "destructive";

const VARIANTS: Record<Variant, string> = {
  primary: "rounded-md bg-primary text-primary-foreground hover:bg-primary-pressed",
  hero: "btn-hero",
  secondary: "rounded-md border border-border bg-surface text-foreground hover:bg-muted",
  destructive: "rounded-md bg-destructive text-destructive-foreground hover:brightness-110",
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
        "inline-flex min-h-14 w-full items-center justify-center px-4 text-lg font-bold transition duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? "Memproses…" : children}
    </button>
  );
}
