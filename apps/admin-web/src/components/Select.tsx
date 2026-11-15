import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/utils";
import { IconCheck, IconChevronDown } from "./Icons";
import { useHighlight, usePopover } from "./Popover";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  // Small right-aligned text, for example a count
  hint?: string;
  disabled?: boolean;
}

interface Props<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  // Accessible name of the control
  label: string;
  icon?: ReactNode;
  // Marks the trigger when a filter is narrowing the list
  active?: boolean;
  align?: "start" | "end";
  disabled?: boolean;
  className?: string;
}

// The admin dropdown: replaces the native <select> so it can follow the design system and animate.
// Keyboard: Enter, Space or the arrows open it; arrows, Home and End move; Enter picks; Escape closes.
export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  icon,
  active,
  align = "start",
  disabled,
  className,
}: Props<T>) {
  const id = useId();
  const { triggerRef, menuRef, open, setOpen, close, style } = usePopover<HTMLButtonElement>({ align, minWidth: 200 });
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const highlight = useHighlight(menuRef, activeIndex, open);
  const selected = options[selectedIndex];

  // A long list keeps the keyboard's option in view.
  useEffect(() => {
    if (open) menuRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, menuRef]);

  const openMenu = () => {
    if (disabled) return;
    setActiveIndex(selectedIndex);
    setOpen(true);
    // Focus moves into the list once it exists, so the keys below drive it.
    requestAnimationFrame(() => menuRef.current?.focus());
  };

  const pick = (i: number) => {
    const option = options[i];
    if (!option || option.disabled) return;
    if (option.value !== value) onChange(option.value);
    close();
  };

  const move = (from: number, step: number) => {
    for (let i = 1; i <= options.length; i++) {
      const next = (from + step * i + options.length * 4) % options.length;
      if (!options[next]?.disabled) return next;
    }
    return from;
  };

  const onTriggerKey = (e: KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      openMenu();
    }
  };

  const onMenuKey = (e: KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => setActiveIndex((i) => move(i, 1)),
      ArrowUp: () => setActiveIndex((i) => move(i, -1)),
      Home: () => setActiveIndex(move(-1, 1)),
      End: () => setActiveIndex(move(options.length, -1)),
      Enter: () => pick(activeIndex),
      " ": () => pick(activeIndex),
      Escape: () => close(),
      Tab: () => close(false),
    };
    const run = keys[e.key];
    if (!run) return;
    if (e.key !== "Tab") e.preventDefault();
    run();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={cn("select-trigger", className)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        aria-label={`${label}: ${selected?.label ?? ""}`}
        data-active={active || undefined}
        disabled={disabled}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onTriggerKey}
      >
        {icon && <span className="select-icon">{icon}</span>}
        <span className="select-value">{selected?.label}</span>
        <IconChevronDown className="select-chevron" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={`${id}-menu`}
            role="listbox"
            tabIndex={-1}
            aria-label={label}
            aria-activedescendant={`${id}-opt-${activeIndex}`}
            className="select-menu"
            style={style}
            onKeyDown={onMenuKey}
          >
            <span aria-hidden="true" className="select-highlight" data-ready={highlight.ready} style={highlight.style} />
            {options.map((o, i) => (
              <div
                key={o.value}
                id={`${id}-opt-${i}`}
                data-index={i}
                role="option"
                aria-selected={o.value === value}
                aria-disabled={o.disabled || undefined}
                className="select-option"
                onPointerEnter={() => !o.disabled && setActiveIndex(i)}
                onClick={() => pick(i)}
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.hint && <span className="select-option-hint">{o.hint}</span>}
                <IconCheck className="select-option-check" />
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
