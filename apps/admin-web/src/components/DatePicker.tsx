import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/utils";
import { IconCalendar, IconChevronDown, IconChevronLeft, IconChevronRight } from "./Icons";
import { usePopover } from "./Popover";

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

// Dates travel as YYYY-MM-DD in local time; Date objects only exist for arithmetic.
export const toIsoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromIso = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => {
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), last));
};

export function formatDateLabel(iso: string): string {
  return fromIso(iso).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

// Monday-first, always six rows so the popover keeps its height between months.
function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => addDays(first, i - offset));
}

interface Props {
  value: string | null;
  onChange: (value: string | null) => void;
  label: string;
  // Latest pickable day, YYYY-MM-DD
  max?: string;
  placeholder?: string;
  align?: "start" | "end";
  className?: string;
}

// A date filter: a field-like trigger and a month calendar. Arrow keys move by day and week, PageUp and
// PageDown by month, Enter picks, Escape closes.
export function DatePicker({ value, onChange, label, max, placeholder = "Semua tanggal", align = "start", className }: Props) {
  const id = useId();
  const { triggerRef, menuRef, open, setOpen, close, style } = usePopover<HTMLButtonElement>({ align, maxHeight: 460, minWidth: 328 });
  const today = toIsoDate(new Date());
  const [focus, setFocus] = useState<Date>(() => fromIso(value ?? today));
  const [month, setMonth] = useState<Date>(() => fromIso(value ?? today));
  const direction = useRef("0px");
  const gridRef = useRef<HTMLDivElement>(null);

  const showMonth = (next: Date) => {
    const delta = next.getFullYear() * 12 + next.getMonth() - (month.getFullYear() * 12 + month.getMonth());
    if (delta !== 0) {
      direction.current = delta > 0 ? "18px" : "-18px";
      setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
    }
  };

  const openPicker = () => {
    const start = fromIso(value ?? today);
    setFocus(start);
    setMonth(new Date(start.getFullYear(), start.getMonth(), 1));
    direction.current = "0px";
    setOpen(true);
  };

  // Keyboard focus follows the focused day, also into a new month.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() =>
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${toIsoDate(focus)}"]`)?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [open, focus, month]);

  const tooLate = (d: Date) => max !== undefined && toIsoDate(d) > max;
  const pick = (d: Date) => {
    if (tooLate(d)) return;
    onChange(toIsoDate(d));
    close();
  };
  const moveFocus = (d: Date) => {
    if (tooLate(d)) return;
    setFocus(d);
    showMonth(d);
  };

  const onKey = (e: KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowLeft: () => moveFocus(addDays(focus, -1)),
      ArrowRight: () => moveFocus(addDays(focus, 1)),
      ArrowUp: () => moveFocus(addDays(focus, -7)),
      ArrowDown: () => moveFocus(addDays(focus, 7)),
      PageUp: () => moveFocus(addMonths(focus, -1)),
      PageDown: () => moveFocus(addMonths(focus, 1)),
      Escape: () => close(),
    };
    const run = keys[e.key];
    if (!run) return;
    e.preventDefault();
    run();
  };

  const nextMonth = addMonths(month, 1);
  const nextDisabled = max !== undefined && toIsoDate(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1)) > max;
  const monthKey = `${month.getFullYear()}-${month.getMonth()}`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={cn("select-trigger", className)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${id}-cal` : undefined}
        aria-label={`${label}: ${value ? formatDateLabel(value) : placeholder}`}
        data-active={value ? true : undefined}
        onClick={() => (open ? close(false) : openPicker())}
      >
        <span className="select-icon">
          <IconCalendar />
        </span>
        <span className="select-value tabular-nums">{value ? formatDateLabel(value) : placeholder}</span>
        <IconChevronDown className="select-chevron" />
      </button>
      {open &&
        createPortal(
          <div ref={menuRef} id={`${id}-cal`} role="dialog" aria-label={label} className="select-menu" style={style} onKeyDown={onKey}>
            <div className="calendar">
              <div className="calendar-head">
                <button type="button" className="calendar-nav" aria-label="Bulan sebelumnya" onClick={() => showMonth(addMonths(month, -1))}>
                  <IconChevronLeft />
                </button>
                <p className="text-sm font-extrabold tracking-tight" aria-live="polite">
                  {MONTHS[month.getMonth()]} {month.getFullYear()}
                </p>
                <button
                  type="button"
                  className="calendar-nav"
                  aria-label="Bulan berikutnya"
                  disabled={nextDisabled}
                  onClick={() => showMonth(nextMonth)}
                >
                  <IconChevronRight />
                </button>
              </div>
              <div className="calendar-grid" aria-hidden="true">
                {WEEKDAYS.map((w) => (
                  <span key={w} className="calendar-weekday">
                    {w}
                  </span>
                ))}
              </div>
              <div
                key={monthKey}
                ref={gridRef}
                role="grid"
                className="calendar-grid swap-in"
                style={{ "--swap-x": direction.current } as CSSProperties}
              >
                {monthGrid(month).map((d) => {
                  const iso = toIsoDate(d);
                  const isFocus = iso === toIsoDate(focus);
                  return (
                    <button
                      key={iso}
                      type="button"
                      data-date={iso}
                      className="calendar-day"
                      aria-pressed={iso === value}
                      aria-label={formatDateLabel(iso)}
                      data-today={iso === today || undefined}
                      data-outside={d.getMonth() !== month.getMonth() || undefined}
                      disabled={tooLate(d)}
                      tabIndex={isFocus ? 0 : -1}
                      onClick={() => pick(d)}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    onChange(null);
                    close();
                  }}
                  disabled={!value}
                >
                  Semua tanggal
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => pick(fromIso(today))}>
                  Hari ini
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
