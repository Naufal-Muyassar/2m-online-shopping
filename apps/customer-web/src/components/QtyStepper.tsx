import { IconMinus, IconPlus } from "./Icons";

interface Props {
  name: string;
  qty: number;
  canDecrease: boolean;
  canIncrease: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
}

const stepButton =
  "flex size-11 shrink-0 items-center justify-center rounded-full text-lg text-primary hover:bg-primary-surface disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent";

export function QtyStepper({ name, qty, canDecrease, canIncrease, onDecrease, onIncrease }: Props) {
  return (
    <div className="flex items-center justify-between rounded-full border border-border bg-surface">
      <button type="button" aria-label={`Kurangi ${name}`} disabled={!canDecrease} onClick={onDecrease} className={stepButton}>
        <IconMinus />
      </button>
      <span className="min-w-6 text-center text-sm font-bold" aria-live="polite">
        {qty}
      </span>
      <button type="button" aria-label={`Tambah ${name}`} disabled={!canIncrease} onClick={onIncrease} className={stepButton}>
        <IconPlus />
      </button>
    </div>
  );
}
