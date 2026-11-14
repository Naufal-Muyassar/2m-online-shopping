import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Apple-style spring parameters: damping ratio (1 = no overshoot) and response in seconds.
interface Spring {
  damping: number;
  response: number;
}
const OPEN: Spring = { damping: 1, response: 0.38 };
const DISMISS: Spring = { damping: 1, response: 0.3 };
// Only a released drag carried momentum, so only it may overshoot a little.
const RELEASE: Spring = { damping: 0.8, response: 0.3 };

const DRAG_SLOP = 10;
const VELOCITY_WINDOW_MS = 100;
// Sheets decelerate faster than a scroll view, so the projection uses the snappier rate.
const DECELERATION = 0.99;

const project = (velocity: number) => ((velocity / 1000) * DECELERATION) / (1 - DECELERATION);
const rubberband = (overshoot: number, dimension: number, c = 0.55) => (overshoot * dimension * c) / (dimension + c * overshoot);
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Drag {
  id: number;
  startY: number;
  startSheet: number;
  active: boolean;
  history: { t: number; y: number }[];
}

interface Props {
  labelledBy: string;
  onClose: () => void;
  /** Gets `close`, which slides the sheet away before calling `onClose`. */
  children: (close: () => void) => ReactNode;
}

/**
 * A bottom sheet the finger can pull down to dismiss: 1:1 tracking, rubber-banding when pulled up,
 * and a spring on release that takes the finger's velocity and projects it to pick open or closed.
 * Anywhere on the sheet drags when its content does not scroll; otherwise only `[data-sheet-drag]`.
 */
export function BottomSheet({ labelledBy, onClose, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const y = useRef(0);
  const velocity = useRef(0);
  const frame = useRef(0);
  const animating = useRef(false);
  const closing = useRef(false);
  const drag = useRef<Drag | null>(null);
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  const [scrollable, setScrollable] = useState(false);

  const height = () => panelRef.current?.offsetHeight ?? window.innerHeight;
  // Once the sheet is on its way out, taps go to the page behind the fading scrim.
  const setDismissing = (on: boolean) => {
    closing.current = on;
    if (scrimRef.current) scrimRef.current.style.pointerEvents = on ? "none" : "";
  };

  const paint = useCallback(() => {
    const panel = panelRef.current;
    const scrim = scrimRef.current;
    if (!panel || !scrim) return;
    panel.style.transform = `translate3d(0, ${y.current}px, 0)`;
    scrim.style.opacity = String(Math.min(1, Math.max(0, 1 - y.current / height())));
  }, []);

  // Animates from the live position and velocity, so a new target or a grab never jumps.
  const springTo = useCallback(
    (target: number, spring: Spring, done?: () => void) => {
      cancelAnimationFrame(frame.current);
      if (reducedMotion()) {
        y.current = target;
        velocity.current = 0;
        paint();
        done?.();
        return;
      }
      const stiffness = (2 * Math.PI / spring.response) ** 2;
      const damping = (4 * Math.PI * spring.damping) / spring.response;
      let last = performance.now();
      animating.current = true;
      const step = (now: number) => {
        let dt = Math.min(0.064, (now - last) / 1000);
        last = now;
        while (dt > 0) {
          const h = Math.min(dt, 1 / 240);
          const accel = -stiffness * (y.current - target) - damping * velocity.current;
          velocity.current += accel * h;
          y.current += velocity.current * h;
          dt -= h;
        }
        if (Math.abs(y.current - target) < 0.5 && Math.abs(velocity.current) < 10) {
          y.current = target;
          velocity.current = 0;
          animating.current = false;
          paint();
          done?.();
          return;
        }
        paint();
        frame.current = requestAnimationFrame(step);
      };
      frame.current = requestAnimationFrame(step);
    },
    [paint],
  );

  const close = useCallback(() => {
    if (closing.current) return;
    setDismissing(true);
    springTo(height(), DISMISS, onClose);
  }, [springTo, onClose]);

  // Start below the screen and spring up, before the first paint.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (panel) setScrollable(panel.scrollHeight > panel.clientHeight + 1);
    y.current = height();
    paint();
    springTo(0, OPEN);
    return () => cancelAnimationFrame(frame.current);
  }, [paint, springTo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [close, opener]);

  function begin(e: PointerEvent<HTMLDivElement>, d: Drag) {
    cancelAnimationFrame(frame.current);
    animating.current = false;
    setDismissing(false);
    d.active = true;
    d.startY = e.clientY;
    d.startSheet = y.current;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (scrollable && !(e.target as Element).closest("[data-sheet-drag]")) return;
    const d: Drag = { id: e.pointerId, startY: e.clientY, startSheet: y.current, active: false, history: [] };
    drag.current = d;
    // A sheet already in motion is caught straight away, mid-flight.
    if (animating.current) begin(e, d);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    if (!d.active) {
      if (Math.abs(e.clientY - d.startY) < DRAG_SLOP) return;
      begin(e, d);
    }
    const raw = d.startSheet + e.clientY - d.startY;
    y.current = raw < 0 ? -rubberband(-raw, height()) : raw;
    paint();
    d.history.push({ t: e.timeStamp, y: e.clientY });
    while (d.history.length > 2 && e.timeStamp - d.history[0]!.t > VELOCITY_WINDOW_MS) d.history.shift();
  }

  function release(e: PointerEvent<HTMLDivElement>, cancelled: boolean) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    if (!d.active) {
      // A tap that caught nothing: if the sheet was stopped mid-way, send it home.
      if (y.current !== 0 && !closing.current) springTo(0, OPEN);
      return;
    }
    const first = d.history[0];
    const last = d.history[d.history.length - 1];
    const v = !cancelled && first && last && last.t > first.t ? ((last.y - first.y) / (last.t - first.t)) * 1000 : 0;
    velocity.current = v;
    if (y.current + project(v) > height() / 2) {
      setDismissing(true);
      springTo(height(), { ...DISMISS, response: 0.25 }, onClose);
    } else {
      springTo(0, RELEASE);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[900] flex items-end justify-center">
      <div ref={scrimRef} aria-hidden="true" className="sheet-backdrop" style={{ animation: "none", zIndex: 0 }} onClick={close} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="sheet-panel relative z-[1] will-change-transform"
        style={{ animation: "none", touchAction: scrollable ? "pan-y" : "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => release(e, false)}
        onPointerCancel={(e) => release(e, true)}
      >
        <div data-sheet-drag className="-mx-4 -mt-3 flex touch-none justify-center pb-1 pt-3">
          <span aria-hidden="true" className="sheet-grabber" />
        </div>
        {children(close)}
      </div>
    </div>,
    document.body,
  );
}
