import { useEffect, useState } from "react";
import { registerSW } from "virtual:pwa-register";

type UpdateFn = (reload?: boolean) => Promise<void>;

let updateSW: UpdateFn | null = null;
let listener: ((needed: boolean) => void) | null = null;
let needed = false;

// registerType "prompt": a new service worker waits until applyUpdate() is called.
export function initPwa() {
  updateSW = registerSW({
    onNeedRefresh() {
      needed = true;
      listener?.(true);
    },
  });
}

export function usePwaUpdate() {
  const [available, setAvailable] = useState(needed);
  useEffect(() => {
    listener = setAvailable;
    return () => {
      listener = null;
    };
  }, []);
  return { available, applyUpdate: () => void updateSW?.(true) };
}
