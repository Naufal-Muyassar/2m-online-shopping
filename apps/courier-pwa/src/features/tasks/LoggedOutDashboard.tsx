import { useRef, useState, type PointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import { FaArrowRight } from "react-icons/fa";

function DeliveryArt() {
  return (
    <svg viewBox="0 0 280 200" className="w-full max-w-xs" aria-hidden="true" focusable="false">
      <ellipse cx="140" cy="182" rx="118" ry="9" fill="hsl(var(--primary) / 0.14)" />
      <rect x="64" y="58" width="74" height="60" rx="8" fill="hsl(var(--warning-surface))" stroke="hsl(var(--warning))" strokeWidth="3" />
      <path d="M101 58v60M64 84h74" stroke="hsl(var(--warning))" strokeWidth="3" />
      <path
        d="M58 126h92c10 0 16-8 20-20l10-44h20l-12 56c8 2 18 8 24 18l6 12H46c0-12 4-22 12-22z"
        fill="hsl(var(--primary))"
      />
      <path d="M172 62h34" stroke="hsl(var(--foreground))" strokeWidth="7" strokeLinecap="round" />
      <circle cx="84" cy="154" r="25" fill="hsl(var(--foreground))" />
      <circle cx="84" cy="154" r="10" fill="hsl(var(--surface))" />
      <circle cx="208" cy="154" r="25" fill="hsl(var(--foreground))" />
      <circle cx="208" cy="154" r="10" fill="hsl(var(--surface))" />
      <path d="M14 96h30M4 116h24M22 136h14" stroke="hsl(var(--primary) / 0.4)" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

const TRACK_PADDING = 12;

function SlideToLogin() {
  const navigate = useNavigate();
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLButtonElement>(null);
  const startX = useRef<number | null>(null);
  const dragged = useRef(false);
  const [offset, setOffset] = useState(0);

  const maxOffset = () => (trackRef.current?.clientWidth ?? 0) - (thumbRef.current?.offsetWidth ?? 0) - TRACK_PADDING;

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    startX.current = e.clientX;
    dragged.current = false;
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (startX.current === null) return;
    const moved = e.clientX - startX.current;
    if (Math.abs(moved) > 5) dragged.current = true;
    setOffset(Math.min(Math.max(moved, 0), maxOffset()));
  };

  const onPointerUp = () => {
    startX.current = null;
    if (!dragged.current) return;
    if (offset >= maxOffset() * 0.6) navigate("/login");
    else setOffset(0);
  };

  return (
    <div ref={trackRef} className="relative flex h-16 items-center rounded-xl bg-rail-foreground p-1.5">
      <span className="absolute right-6 flex items-center gap-2 text-sm font-bold text-rail">
        Geser <FaArrowRight aria-hidden="true" />
      </span>
      <button
        ref={thumbRef}
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={() => {
          if (!dragged.current) navigate("/login");
        }}
        style={{ transform: `translateX(${offset}px)` }}
        className="relative h-full touch-none rounded-[0.625rem] bg-rail px-8 font-extrabold text-rail-foreground shadow-md"
      >
        Masuk
      </button>
    </div>
  );
}

export function LoggedOutDashboard() {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex flex-1 flex-col gap-6 px-5 pb-8 pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <p className="flex items-center gap-3 text-lg font-extrabold tracking-tight">
          <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-md bg-rail text-sm text-rail-foreground">
            2M
          </span>
          Kurir
        </p>
        <div className="flex flex-1 items-center justify-center">
          <DeliveryArt />
        </div>
      </div>
      <main className="panel-ink flex flex-col gap-6 rounded-none px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-7">
        <div>
          <h1 className="t-display">Antar cepat, aman, dan tepat waktu</h1>
          <p className="mt-3 text-rail-muted">Masuk ke akun kurir untuk melihat order dan mulai bekerja.</p>
        </div>
        <SlideToLogin />
      </main>
    </div>
  );
}
