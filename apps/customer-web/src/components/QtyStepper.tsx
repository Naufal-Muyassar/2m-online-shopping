import { IconMinus, IconPlus } from "./Icons";
import { cn } from "../lib/utils";

interface Props {
  name: string;
  qty: number;
  canDecrease: boolean;
  canIncrease: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  className?: string;
}

export function QtyStepper({ name, qty, canDecrease, canIncrease, onDecrease, onIncrease, className }: Props) {
  return (
    <div className={cn("stepper", className)}>
      <button type="button" aria-label={`Kurangi ${name}`} disabled={!canDecrease} onClick={onDecrease} className="stepper-key">
        <IconMinus />
      </button>
      <span className="min-w-8 text-center text-sm font-extrabold tabular-nums" aria-live="polite">
        {qty}
      </span>
      <button type="button" aria-label={`Tambah ${name}`} disabled={!canIncrease} onClick={onIncrease} className="stepper-key">
        <IconPlus />
      </button>
    </div>
  );
}
