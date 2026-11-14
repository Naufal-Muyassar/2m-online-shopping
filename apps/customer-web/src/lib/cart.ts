import { useSyncExternalStore } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Cart, Product } from "@2m/shared";
import { api } from "./api";

// Taps inside this window collapse into one request with the final quantity.
const SEND_AFTER_MS = 350;

const round3 = (n: number) => Math.round(n * 1000) / 1000;

function withQty(cart: Cart, productId: string, qty: number): Cart {
  const items =
    qty <= 0
      ? cart.items.filter((i) => i.product_id !== productId)
      : cart.items.map((i) => (i.product_id === productId ? { ...i, qty, line_total: i.price * qty } : i));
  return {
    ...cart,
    items,
    subtotal: items.reduce((s, i) => s + i.line_total, 0),
    total_weight_kg: round3(items.reduce((s, i) => s + i.weight_kg * i.qty, 0)),
  };
}

type Request = { kind: "add"; qty: number } | { kind: "set"; qty: number } | { kind: "remove" };

/**
 * Keeps the cart on screen ahead of the server. Every change lands in the query cache at once;
 * the request goes out after a short pause, one per product at a time and in order, so a burst
 * of taps costs one round trip. Server carts are applied only once nothing is waiting, so an
 * older response never undoes a newer tap. On a failure the cart is refetched from the server.
 */
class CartSync {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private chains = new Map<string, Promise<void>>();
  private queued = 0;
  private failed = false;
  private listeners = new Set<() => void>();
  // The add for a product not yet on the server goes first; later taps become a "set" behind it.
  private unsent = new Map<string, Request>();

  constructor(
    private qc: QueryClient,
    private branchId: string,
  ) {}

  private get key() {
    return ["cart", this.branchId];
  }

  get pending(): boolean {
    return this.timers.size > 0 || this.queued > 0;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private emit() {
    for (const fn of this.listeners) fn();
  }

  private paint(update: (c: Cart) => Cart) {
    void this.qc.cancelQueries({ queryKey: this.key });
    this.qc.setQueryData<Cart>(this.key, (c) => (c ? update(c) : c));
  }

  add(product: Product, qty = 1) {
    this.paint((c) =>
      c.items.some((i) => i.product_id === product.id)
        ? c
        : {
            ...c,
            items: [
              ...c.items,
              {
                product_id: product.id,
                sku: product.sku,
                name: product.name,
                unit: product.unit,
                price: product.price,
                weight_kg: product.weight_kg,
                qty: 0,
                line_total: 0,
                sellable_qty: product.sellable_qty,
              },
            ],
          },
    );
    this.paint((c) => withQty(c, product.id, qty));
    this.schedule(product.id, { kind: "add", qty }, 0);
  }

  setQty(productId: string, qty: number) {
    this.paint((c) => withQty(c, productId, qty));
    const first = this.unsent.get(productId);
    // Still waiting to be created on the server: fold the change into that add.
    if (first?.kind === "add") {
      if (qty <= 0) {
        this.unsent.delete(productId);
        clearTimeout(this.timers.get(productId));
        this.timers.delete(productId);
        this.emit();
        this.settle();
      } else this.schedule(productId, { kind: "add", qty }, SEND_AFTER_MS);
      return;
    }
    this.schedule(productId, qty <= 0 ? { kind: "remove" } : { kind: "set", qty }, qty <= 0 ? 0 : SEND_AFTER_MS);
  }

  private schedule(productId: string, req: Request, delay: number) {
    this.unsent.set(productId, req);
    clearTimeout(this.timers.get(productId));
    this.timers.set(
      productId,
      setTimeout(() => {
        this.timers.delete(productId);
        const latest = this.unsent.get(productId);
        this.unsent.delete(productId);
        if (latest) this.enqueue(productId, latest);
      }, delay),
    );
    this.emit();
  }

  private send(productId: string, req: Request): Promise<Cart> {
    const branch_id = this.branchId;
    if (req.kind === "add") return api.post<Cart>("/cart/items", { branch_id, product_id: productId, qty: req.qty }).then((r) => r.data);
    if (req.kind === "set") return api.patch<Cart>(`/cart/items/${productId}`, { branch_id, qty: req.qty }).then((r) => r.data);
    return api.delete<Cart>(`/cart/items/${productId}`, { params: { branch_id } }).then((r) => r.data);
  }

  private enqueue(productId: string, req: Request) {
    this.queued += 1;
    this.emit();
    const prev = this.chains.get(productId) ?? Promise.resolve();
    const next = prev.then(async () => {
      try {
        const cart = await this.send(productId, req);
        if (!this.failed && this.queued === 1 && this.timers.size === 0) this.qc.setQueryData(this.key, cart);
      } catch (err) {
        if (!this.failed) this.onError?.(err);
        this.failed = true;
      } finally {
        this.queued -= 1;
        this.emit();
        this.settle();
      }
    });
    this.chains.set(productId, next);
  }

  // Once everything is sent, a failure in the burst is repaired by reading the server's cart.
  private settle() {
    if (this.pending) return;
    if (this.failed) {
      this.failed = false;
      void this.qc.invalidateQueries({ queryKey: this.key });
    }
  }

  onError: ((err: unknown) => void) | undefined;
}

const syncs = new Map<string, CartSync>();

/** Optimistic, batched cart edits for one branch. `pending` is true until the server has every change. */
export function useCartSync(branchId: string, onError: (err: unknown) => void) {
  const qc = useQueryClient();
  let sync = syncs.get(branchId);
  if (!sync) {
    sync = new CartSync(qc, branchId);
    syncs.set(branchId, sync);
  }
  sync.onError = onError;
  const s = sync;
  const pending = useSyncExternalStore(s.subscribe, () => s.pending);
  return {
    pending,
    add: (product: Product, qty?: number) => s.add(product, qty),
    setQty: (productId: string, qty: number) => s.setQty(productId, qty),
    remove: (productId: string) => s.setQty(productId, 0),
  };
}

export type CapReason = "stock" | "sku" | "weight";

/** The most of one product this cart can hold now, and which limit sets it: stock, per-product, or order weight. */
export function qtyCap(
  cart: Cart | undefined,
  item: { product_id: string; weight_kg: number; sellable_qty: number },
): { max: number; reason: CapReason } {
  let max = item.sellable_qty;
  let reason: CapReason = "stock";
  if (!cart) return { max: Math.max(0, max), reason };
  if (cart.limits.max_qty_per_sku < max) {
    max = cart.limits.max_qty_per_sku;
    reason = "sku";
  }
  if (item.weight_kg > 0) {
    const current = cart.items.find((i) => i.product_id === item.product_id)?.qty ?? 0;
    const others = cart.total_weight_kg - item.weight_kg * current;
    const byWeight = Math.floor((cart.limits.max_order_weight_kg - others) / item.weight_kg + 1e-6);
    if (byWeight < max) {
      max = byWeight;
      reason = "weight";
    }
  }
  return { max: Math.max(0, max), reason };
}

export function capMessage(cart: Cart | undefined, name: string, cap: { max: number; reason: CapReason }): string {
  if (cap.reason === "weight") return `Berat pesanan maksimal ${cart?.limits.max_order_weight_kg ?? ""} kg, jadi ${name} paling banyak ${cap.max}.`;
  if (cap.reason === "sku") return `Maksimal ${cap.max} per produk untuk ${name}.`;
  return `Stok ${name} tinggal ${cap.max}.`;
}
