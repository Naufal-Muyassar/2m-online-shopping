import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { stockEventSchema, type ProductDetail, type ProductsResponse, type StockLevel } from "@2m/shared";
import { useMetaConfig } from "./queries";

export type LiveState = "connecting" | "live" | "offline";

// The server sends a snapshot as soon as a stream opens. No event by then means something between the browser and
// the API holds the response back (a static host's rewrite proxy buffers a never-ending body), so stop waiting.
const FIRST_EVENT_MS = 5_000;
const RETRY_MS = [3_000, 15_000, 60_000];
const OFFLINE_POLL_MS = 20_000;

// Keeps the cached product page and catalogue rows in step with the server's sellable quantity.
// What it shows is a hint: the checkout reservation decides, so a stale number can only cost a refused checkout,
// never an oversold one. The stream closes while the tab is hidden and reopens (with a fresh snapshot) on return.
export function useLiveStock(branchId: string, productIds: readonly string[]): LiveState {
  const qc = useQueryClient();
  const meta = useMetaConfig();
  const [state, setState] = useState<LiveState>("connecting");
  const ids = useMemo(() => [...new Set(productIds)].sort().join(","), [productIds]);
  // Opened straight at the API when it says where it lives; same origin otherwise (the Vite dev proxy streams fine).
  const origin = meta.isPending ? undefined : (meta.data?.live_stock_origin ?? "");

  useEffect(() => {
    if (!branchId || !ids || origin === undefined) return;
    let source: EventSource | null = null;
    let retryTimer: number | undefined;
    let firstEventTimer: number | undefined;
    let pollTimer: number | undefined;
    let failures = 0;
    let disposed = false;

    const apply = (items: StockLevel[]) => {
      const byId = new Map(items.map((i) => [i.product_id, i]));
      for (const i of items) {
        qc.setQueryData<ProductDetail>(["product", branchId, i.product_id], (old) =>
          old ? { ...old, sellable_qty: i.sellable_qty, stock_status: i.stock_status } : old,
        );
      }
      qc.setQueriesData<ProductsResponse>({ queryKey: ["products", branchId] }, (old) =>
        old
          ? {
              ...old,
              products: old.products.map((p) => {
                const l = byId.get(p.id);
                return l ? { ...p, sellable_qty: l.sellable_qty, stock_status: l.stock_status } : p;
              }),
            }
          : old,
      );
    };

    // Without a stream the page still refreshes, just slower.
    const startPolling = () => {
      if (pollTimer !== undefined) return;
      pollTimer = window.setInterval(() => {
        for (const id of ids.split(",")) void qc.invalidateQueries({ queryKey: ["product", branchId, id] });
      }, OFFLINE_POLL_MS);
    };
    const stopPolling = () => {
      window.clearInterval(pollTimer);
      pollTimer = undefined;
    };

    const close = () => {
      source?.close();
      source = null;
      window.clearTimeout(firstEventTimer);
      window.clearTimeout(retryTimer);
    };

    // Gives up on this stream, polls meanwhile, and tries a new one later.
    const fail = () => {
      close();
      setState("offline");
      startPolling();
      const wait = RETRY_MS[Math.min(failures++, RETRY_MS.length - 1)];
      retryTimer = window.setTimeout(open, wait);
    };

    function open() {
      if (disposed || document.hidden) return;
      if (typeof EventSource === "undefined") {
        setState("offline");
        startPolling();
        return;
      }
      source = new EventSource(`${origin}/api/v1/branches/${branchId}/stock/stream?product_ids=${encodeURIComponent(ids)}`);
      firstEventTimer = window.setTimeout(fail, FIRST_EVENT_MS);
      source.addEventListener("stock", (e) => {
        window.clearTimeout(firstEventTimer);
        const parsed = stockEventSchema.safeParse(JSON.parse((e as MessageEvent<string>).data));
        if (!parsed.success) return;
        failures = 0;
        stopPolling();
        setState("live");
        apply(parsed.data.items);
      });
      source.onerror = () => {
        // CONNECTING: the browser reconnects by itself (server "retry:" hint) and the snapshot comes again.
        // CLOSED: an HTTP or CORS error, so retry ourselves with backoff.
        setState("offline");
        startPolling();
        if (source?.readyState === EventSource.CLOSED) fail();
      };
    }

    const onVisibility = () => {
      if (document.hidden) close();
      else if (!source) {
        setState("connecting");
        open();
      }
    };

    open();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      close();
      stopPolling();
    };
  }, [branchId, ids, origin, qc]);

  return state;
}
