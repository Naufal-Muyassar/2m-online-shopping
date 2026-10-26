import type { ReactNode } from "react";
import { IconAlert } from "./Icons";

export const btnPrimary =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 font-medium text-primary-foreground hover:bg-primary-pressed disabled:cursor-not-allowed disabled:opacity-60";
export const btnSecondary =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-surface px-5 font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";

export const rise = (index: number) => ({ animationDelay: `${Math.min(index, 6) * 70}ms` });

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty-state animate-rise">
      <span className="empty-state-icon">{icon}</span>
      <p className="text-base font-bold text-foreground">{title}</p>
      {children}
    </div>
  );
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 text-center" role="alert">
      <span className="empty-state-icon">
        <IconAlert />
      </span>
      <p className="font-medium text-destructive">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={btnSecondary}>
          Coba lagi
        </button>
      )}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <main className="app-main" aria-busy="true" aria-label="Memuat">
      <div className="skeleton h-7 w-1/2" />
      <div className="skeleton h-24 rounded-lg" />
      <div className="skeleton h-24 rounded-lg" />
      <div className="skeleton h-24 rounded-lg" />
    </main>
  );
}
