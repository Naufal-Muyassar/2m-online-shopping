import { useEffect, useState } from "react";
import { registerSW } from "virtual:pwa-register";

// If the new worker takes over but the browser never fires `controllerchange` (seen in iOS
// standalone mode), reload anyway so the tap is never a dead end.
const FALLBACK_RELOAD_MS = 4_000;

let registration: ServiceWorkerRegistration | undefined;
let listener: ((needed: boolean) => void) | null = null;
let needed = false;

// registerType "prompt": a new service worker waits until applyUpdate() is called.
export function initPwa() {
  registerSW({
    onNeedRefresh() {
      needed = true;
      listener?.(true);
    },
    onRegisteredSW(_url, r) {
      registration = r;
    },
  });
}

let reloading = false;
function reloadOnce() {
  if (reloading) return;
  reloading = true;
  window.location.reload();
}

async function applyUpdate() {
  const r = registration ?? (await navigator.serviceWorker?.getRegistration());
  const waiting = r?.waiting;
  // Nothing waiting: another tab (or a relaunch) already activated it, so a reload picks it up.
  if (!waiting) {
    reloadOnce();
    return;
  }
  navigator.serviceWorker.addEventListener("controllerchange", reloadOnce, { once: true });
  waiting.addEventListener("statechange", () => {
    if (waiting.state === "activated") reloadOnce();
  });
  // The generated worker skips waiting on this message.
  waiting.postMessage({ type: "SKIP_WAITING" });
  setTimeout(reloadOnce, FALLBACK_RELOAD_MS);
}

export function usePwaUpdate() {
  const [available, setAvailable] = useState(needed);
  const [updating, setUpdating] = useState(false);
  useEffect(() => {
    listener = setAvailable;
    return () => {
      listener = null;
    };
  }, []);
  return {
    available,
    updating,
    applyUpdate: () => {
      setUpdating(true);
      void applyUpdate();
    },
  };
}
