import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "destructive";

const VARIANTS: Record<Variant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  destructive: "btn-danger",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

// Courier actions are full width and 3.5rem tall: they are pressed on the move, often with one thumb.
export function Button({ variant = "primary", loading, disabled, className, children, ...rest }: Props) {
  return (
    <button type="button" disabled={disabled || loading} className={cn("btn btn-lg btn-block", VARIANTS[variant], className)} {...rest}>
      {loading ? "Memproses…" : children}
    </button>
  );
}
