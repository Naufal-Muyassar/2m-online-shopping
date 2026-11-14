import type { ReactNode } from "react";
import { IconAlert } from "./Icons";

export const rise = (index: number) => ({ animationDelay: `${Math.min(index, 6) * 60}ms` });

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty-state animate-rise">
      <span className="empty-state-icon">{icon}</span>
      <p className="t-title text-foreground">{title}</p>
      {children}
    </div>
  );
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-start gap-3" role="alert">
      <p className="flex items-center gap-2 font-semibold text-destructive">
        <IconAlert className="shrink-0 text-xl" />
        {message}
      </p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn btn-secondary">
          Coba lagi
        </button>
      )}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <main className="app-main" aria-busy="true" aria-label="Memuat">
      <div className="skeleton h-9 w-1/2 max-w-xs" />
      <div className="skeleton h-20" />
      <div className="skeleton h-20" />
      <div className="skeleton h-20" />
    </main>
  );
}
