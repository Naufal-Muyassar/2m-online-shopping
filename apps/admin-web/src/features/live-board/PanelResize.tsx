import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

// The order panel floats over the map from xl. Its width is 24rem by default and can be dragged
// out to a quarter of the window, never less than 32rem so a laptop still has room to widen it.
export const PANEL_MIN = 384;
const PANEL_FLOOR_MAX = 512;
// The map keeps at least this much width beside the panel.
const MAP_KEEP = 192;
const KEY_STEP = 16;
const STORAGE_KEY = "2m.admin.order_panel_width";

function readStored(): number {
  try {
    const n = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(n) && n >= PANEL_MIN ? n : PANEL_MIN;
  } catch {
    return PANEL_MIN;
  }
}

function maxWidth(container: HTMLElement | null): number {
  const quarter = Math.max(window.innerWidth / 4, PANEL_FLOOR_MAX);
  const room = container ? container.clientWidth - MAP_KEEP : quarter;
  return Math.max(PANEL_MIN, Math.min(quarter, room));
}

const clamp = (w: number, max: number) => Math.round(Math.min(Math.max(w, PANEL_MIN), max));

/** The saved panel width, clamped again whenever the window changes size. */
export function usePanelWidth() {
  const [width, setWidth] = useState(readStored);

  useEffect(() => {
    const onResize = () => setWidth((w) => clamp(w, maxWidth(null)));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const commit = useCallback((w: number) => {
    setWidth(w);
    try {
      localStorage.setItem(STORAGE_KEY, String(w));
    } catch {
      // Private mode: the width just resets on the next visit.
    }
  }, []);

  return [width, commit] as const;
}

interface HandleProps {
  width: number;
  /** Live width while dragging; the panel follows it without re-rendering the map. */
  onDrag: (w: number) => void;
  onCommit: (w: number) => void;
}

/** A vertical grip on the panel's left edge. Shown on hover or focus; drag, arrow keys, or double-click to reset. */
export function ResizeHandle({ width, onDrag, onCommit }: HandleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; w: number; max: number; last: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const container = () => ref.current?.parentElement?.parentElement ?? null;

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, w: width, max: maxWidth(container()), last: width };
    setDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    // The panel is anchored on the right, so moving the pointer left widens it.
    d.last = clamp(d.w + d.x - e.clientX, d.max);
    onDrag(d.last);
  }

  function end() {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setDragging(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    onCommit(d.last);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const max = maxWidth(container());
    const next =
      e.key === "ArrowLeft" ? width + KEY_STEP : e.key === "ArrowRight" ? width - KEY_STEP : e.key === "Home" ? PANEL_MIN : e.key === "End" ? max : null;
    if (next === null) return;
    e.preventDefault();
    onCommit(clamp(next, max));
  }

  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation="vertical"
      aria-label="Lebar panel order"
      aria-valuemin={PANEL_MIN}
      aria-valuemax={Math.round(maxWidth(container()))}
      aria-valuenow={width}
      tabIndex={0}
      title="Seret untuk mengubah lebar, klik dua kali untuk mengembalikan"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onDoubleClick={() => onCommit(PANEL_MIN)}
      onKeyDown={onKeyDown}
      className="group/grip absolute -left-3 top-0 hidden h-full w-3 cursor-col-resize touch-none items-center justify-center outline-none xl:flex"
    >
      <span
        aria-hidden="true"
        className={
          "h-12 w-1.5 rounded-full transition-[opacity,background-color,height] duration-200 ease-settle " +
          (dragging
            ? "h-16 bg-foreground/70 opacity-100"
            : "bg-muted-foreground/55 opacity-0 group-hover/panel:opacity-100 group-hover/grip:h-16 group-hover/grip:bg-foreground/60 group-focus-visible/grip:opacity-100 group-focus-visible/grip:bg-primary")
        }
      />
    </div>
  );
}
