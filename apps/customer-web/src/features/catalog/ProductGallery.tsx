import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "../../lib/utils";
import { CategoryIcon, categoryTint } from "../../components/category";
import { IconBack, IconForward } from "../../components/Icons";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The product photos as one swipeable track. Native scroll snap gives the finger 1:1 tracking and momentum;
 * thumbnails (from sm), dots (phones), arrow buttons (from md) and the arrow keys jump to a photo.
 */
export function ProductGallery({ images, name, category }: { images: string[]; name: string; category: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const count = images.length;
  const cover = images[0];

  // A new product starts at the cover.
  useEffect(() => {
    setIndex(0);
    trackRef.current?.scrollTo({ left: 0 });
  }, [cover]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setIndex(Math.round(track.scrollLeft / Math.max(1, track.clientWidth))));
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      track.removeEventListener("scroll", onScroll);
    };
  }, []);

  function go(to: number) {
    const track = trackRef.current;
    if (!track) return;
    const next = Math.max(0, Math.min(count - 1, to));
    setIndex(next);
    track.scrollTo({ left: next * track.clientWidth, behavior: reducedMotion() ? "auto" : "smooth" });
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowLeft") go(index - 1);
    else if (e.key === "ArrowRight") go(index + 1);
    else return;
    e.preventDefault();
  }

  if (count === 0)
    return (
      <div
        className={cn("flex aspect-square items-center justify-center rounded-lg border border-border text-8xl", categoryTint(category))}
        role="img"
        aria-label={`${name}, belum ada foto`}
      >
        <CategoryIcon category={category} />
      </div>
    );

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="group relative">
        <div
          ref={trackRef}
          className="gallery-track"
          role="region"
          aria-roledescription="galeri"
          aria-label={`Foto ${name}`}
          tabIndex={count > 1 ? 0 : -1}
          onKeyDown={onKey}
        >
          {images.map((src, i) => (
            <div key={src} className="gallery-slide" role="group" aria-roledescription="foto" aria-label={`${i + 1} dari ${count}`}>
              <img
                src={src}
                alt={i === 0 ? name : `${name}, foto ${i + 1}`}
                loading={i === 0 ? "eager" : "lazy"}
                decoding="async"
                draggable={false}
              />
            </div>
          ))}
        </div>
        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(index - 1)}
              disabled={index === 0}
              aria-label="Foto sebelumnya"
              className="icon-btn absolute left-3 top-1/2 hidden -translate-y-1/2 rounded-full shadow-sm disabled:invisible md:inline-flex"
            >
              <IconBack />
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              disabled={index === count - 1}
              aria-label="Foto berikutnya"
              className="icon-btn absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-full shadow-sm disabled:invisible md:inline-flex"
            >
              <IconForward />
            </button>
            <span className="pill absolute bottom-3 right-3 bg-surface/90 tabular-nums sm:hidden" aria-hidden="true">
              {index + 1}/{count}
            </span>
          </>
        )}
      </div>
      {count > 1 && (
        <>
          <div className="flex justify-center gap-1.5 sm:hidden" aria-hidden="true">
            {images.map((src, i) => (
              <span key={src} className="gallery-dot" aria-current={i === index} />
            ))}
          </div>
          <ul className="no-scrollbar -mx-1 hidden gap-2 overflow-x-auto px-1 py-1 sm:flex" aria-label="Pilih foto">
            {images.map((src, i) => (
              <li key={src}>
                <button
                  type="button"
                  className="gallery-thumb"
                  aria-current={i === index}
                  aria-label={`Lihat foto ${i + 1}`}
                  onClick={() => go(i)}
                >
                  <img src={src} alt="" loading="lazy" decoding="async" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
