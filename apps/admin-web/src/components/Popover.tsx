import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

const GAP = 6;
const EDGE = 8;

// Places a floating menu under (or, without room, over) its trigger. The menu is fixed-positioned and portalled
// to <body>, so a dialog's scroll box or the order panel's backdrop-filter cannot clip it.
export function usePopover<T extends HTMLElement>(opts: { align?: "start" | "end"; maxHeight?: number; minWidth?: number } = {}) {
  const { align = "start", maxHeight = 320, minWidth = 0 } = opts;
  const triggerRef = useRef<T>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(Math.max(r.width, minWidth), vw - EDGE * 2);
    const below = vh - r.bottom - GAP - EDGE;
    const above = r.top - GAP - EDGE;
    const up = below < Math.min(maxHeight, 220) && above > below;
    let left = align === "end" ? r.right - width : r.left;
    left = Math.min(Math.max(left, EDGE), vw - width - EDGE);
    setStyle({
      left,
      width,
      maxHeight: Math.min(maxHeight, up ? above : below),
      ...(up ? { bottom: vh - r.top + GAP, transformOrigin: "bottom" } : { top: r.bottom + GAP, transformOrigin: "top" }),
    });
  }, [align, maxHeight, minWidth]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    // Scrolling inside the menu must not close it; scrolling the page moves it with the trigger.
    const onScroll = (e: Event) => {
      if (!menuRef.current?.contains(e.target as Node)) place();
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, place]);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  return { triggerRef, menuRef, open, setOpen, close, style };
}

// Measures the option under the pointer or keyboard so one highlight can slide between options.
export function useHighlight(menu: RefObject<HTMLElement>, index: number, open: boolean) {
  const [box, setBox] = useState<{ y: number; h: number } | null>(null);
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    if (!open) {
      setReady(false);
      setBox(null);
      return;
    }
    const el = menu.current?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    setBox(el ? { y: el.offsetTop, h: el.offsetHeight } : null);
  }, [menu, index, open]);
  useEffect(() => {
    if (!open || !box || ready) return;
    // The first placement does not animate, so the highlight does not fly in from the top.
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, [open, box, ready]);
  const style: CSSProperties = box ? { transform: `translateY(${box.y}px)`, height: box.h, opacity: 1 } : { opacity: 0 };
  return { style, ready };
}
