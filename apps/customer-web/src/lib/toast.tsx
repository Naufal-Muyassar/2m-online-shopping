import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { cn } from "./utils";

interface Toast {
  id: number;
  kind: "success" | "error";
  text: string;
}

const ToastContext = createContext<(kind: Toast["kind"], text: string) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-4 bottom-[calc(var(--nav-height)+1.25rem+env(safe-area-inset-bottom))] z-[1000] mx-auto flex max-w-[28rem] flex-col gap-2 md:inset-x-auto md:bottom-6 md:right-6 md:mx-0 md:w-[22rem]"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div key={t.id} className={cn("toast", t.kind === "success" ? "toast-success" : "toast-error")}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
