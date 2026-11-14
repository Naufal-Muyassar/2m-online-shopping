import { useState, type KeyboardEvent } from "react";
import { IconMinus, IconPlus } from "./Icons";
import { cn } from "../lib/utils";

interface Props {
  name: string;
  qty: number;
  /** Lowest value the keys and the field accept. 0 lets the minus key remove the item. */
  min?: number;
  /** Highest value: the stock left, capped by the per-product limit. */
  max: number;
  onChange: (qty: number) => void;
  /** Called when a typed number had to be lowered to `max`. */
  onClamp?: (max: number) => void;
  className?: string;
}

/** Minus, a number the shopper can tap and type into, and plus. Typing commits on Enter or blur. */
export function QtyStepper({ name, qty, min = 1, max, onChange, onClamp, className }: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    if (draft === null) return;
    setDraft(null);
    const n = Number.parseInt(draft, 10);
    if (!Number.isFinite(n) || n < Math.max(min, 1)) return; // empty or zero: keep the old number
    const next = Math.min(n, max);
    if (next < n) onClamp?.(max);
    if (next !== qty) onChange(next);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") {
      setDraft(null);
      e.currentTarget.blur();
    }
  }

  return (
    <div className={cn("stepper", className)}>
      <button
        type="button"
        aria-label={`Kurangi ${name}`}
        disabled={qty <= min}
        onClick={() => onChange(qty - 1)}
        className="stepper-key"
      >
        <IconMinus />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        enterKeyHint="done"
        aria-label={`Jumlah ${name}, maksimal ${max}`}
        value={draft ?? String(qty)}
        onFocus={(e) => {
          setDraft(String(qty));
          e.currentTarget.select();
        }}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 4))}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className="stepper-input"
      />
      <button
        type="button"
        aria-label={`Tambah ${name}`}
        disabled={qty >= max}
        onClick={() => onChange(qty + 1)}
        className="stepper-key"
      >
        <IconPlus />
      </button>
    </div>
  );
}
