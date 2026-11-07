import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { cn } from "../lib/utils";

interface ThumbBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Tracks the active element inside `container`, so a thumb can slide to it on either axis.
export function useThumb(container: RefObject<HTMLElement>, selector: string, dep: unknown) {
  const [box, setBox] = useState<ThumbBox | null>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const measure = () => {
      const active = root.querySelector<HTMLElement>(selector);
      setBox(active ? { x: active.offsetLeft, y: active.offsetTop, width: active.offsetWidth, height: active.offsetHeight } : null);
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(root);
    // The first position is placed without a transition, so the thumb does not fly in on load.
    const frame = requestAnimationFrame(() => setReady(true));
    return () => {
      resize.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [container, selector, dep]);

  const style = box ? { width: box.width, height: box.height, transform: `translate3d(${box.x}px, ${box.y}px, 0)` } : { opacity: 0 };
  return { style, ready };
}

// Offset for `.swap-in`: new content enters from the side of the tab that was clicked.
export function useSwapX(index: number): string {
  const previous = useRef(index);
  const direction = useRef("0px");
  if (index !== previous.current) {
    direction.current = index > previous.current ? "16px" : "-16px";
    previous.current = index;
  }
  return direction.current;
}

export interface SegmentedItem<T extends string> {
  id: T;
  label: ReactNode;
  // Accessible and hover name when the visible label is shortened.
  title?: string;
}

interface Props<T extends string> {
  items: SegmentedItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}

export function Segmented<T extends string>({ items, value, onChange, label, className }: Props<T>) {
  const root = useRef<HTMLDivElement>(null);
  const { style, ready } = useThumb(root, "[aria-selected='true']", `${value}:${items.length}`);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const at = items.findIndex((i) => i.id === value);
    const next = items[(at + (e.key === "ArrowRight" ? 1 : items.length - 1)) % items.length]!;
    onChange(next.id);
    root.current?.querySelector<HTMLElement>(`[data-id="${next.id}"]`)?.focus();
  };

  return (
    <div ref={root} className={cn("segmented", className)} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      <span aria-hidden="true" className="segmented-thumb" data-ready={ready} style={style} />
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          data-id={item.id}
          aria-selected={item.id === value}
          aria-label={item.title}
          title={item.title}
          tabIndex={item.id === value ? 0 : -1}
          onClick={() => onChange(item.id)}
          className="segmented-item"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
