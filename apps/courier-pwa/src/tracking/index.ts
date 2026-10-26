import { useEffect, useState, useSyncExternalStore } from "react";
import type { CourierStatus } from "@2m/shared";
import { api } from "@/lib/api";
import { location } from "@/platform";

const PING_MS = 3 * 60 * 1000;
export const PING_INTERVAL_ON_DELIVERY_MS = 15000;
const ON_DELIVERY_FIX_MAX_AGE_MS = 5000;

let lastPingOkAt: number | null = null;
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

async function sendPing(orderId?: string, maximumAge?: number) {
  try {
    const fix = await location.getCurrentPosition({ maximumAge });
    await api.post("/courier/pings", {
      pings: [{ ...fix, order_id: orderId, client_ts: new Date().toISOString() }],
    });
    lastPingOkAt = Date.now();
    listeners.forEach((l) => l());
  } catch {
    // Pings are best-effort; a missed one is not user-facing.
  }
}

// Seconds since the last successful ping, or null before the first one; re-renders every second.
export function useSecondsSinceLastPing(): number | null {
  const at = useSyncExternalStore(subscribe, () => lastPingOkAt);
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return at === null ? null : Math.max(0, Math.floor((Date.now() - at) / 1000));
}

// Foreground ping while the page is visible and the courier is not OFFLINE: every 3 min, every 15 s while ON_DELIVERY.
export function useForegroundPings(status: CourierStatus | undefined, orderId?: string, onDelivery = false) {
  useEffect(() => {
    if (!status || status === "OFFLINE") return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const maximumAge = onDelivery ? ON_DELIVERY_FIX_MAX_AGE_MS : undefined;
    const start = () => {
      if (timer) return;
      void sendPing(orderId, maximumAge);
      timer = setInterval(() => void sendPing(orderId, maximumAge), onDelivery ? PING_INTERVAL_ON_DELIVERY_MS : PING_MS);
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
  }, [status, orderId, onDelivery]);
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
