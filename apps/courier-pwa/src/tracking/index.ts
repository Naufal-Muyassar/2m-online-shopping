import { useEffect } from "react";
import type { CourierStatus } from "@2m/shared";
import { api } from "@/lib/api";
import { location } from "@/platform";

const PING_MS = 3 * 60 * 1000;

async function sendPing(orderId?: string) {
  try {
    const fix = await location.getCurrentPosition();
    await api.post("/courier/pings", {
      pings: [{ ...fix, order_id: orderId, client_ts: new Date().toISOString() }],
    });
  } catch {
    // Pings are best-effort; a missed one is not user-facing.
  }
}

// Foreground ping every 3 min while the page is visible and the courier is not OFFLINE.
export function useForegroundPings(status: CourierStatus | undefined, orderId?: string) {
  useEffect(() => {
    if (!status || status === "OFFLINE") return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      void sendPing(orderId);
      timer = setInterval(() => void sendPing(orderId), PING_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => (document.visibilityState === "visible" ? start() : stop());
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [status, orderId]);
}

// Screen Wake Lock while a delivery is ON_DELIVERY; re-acquired when the tab becomes visible again.
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const s = await navigator.wakeLock.request("screen");
        if (cancelled) void s.release();
        else sentinel = s;
      } catch {
        // Denied (e.g. low battery); delivery continues without it.
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release();
    };
  }, [active]);
}
