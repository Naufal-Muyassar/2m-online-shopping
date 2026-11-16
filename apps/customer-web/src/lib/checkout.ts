import { create } from "zustand";

const newKey = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
        (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0]! & (15 >> (Number(c) / 4)))).toString(16),
      );

// Selected delivery address and payment method per checkout session, plus the Idempotency-Key of the checkout
// in flight. One key per intent: every retry of the same request reuses it, so the server replays the first
// outcome instead of creating a second order. A different request (address, method) or a final answer starts a new one.
interface CheckoutState {
  addressId: string | null;
  paymentMethod: string;
  attempt: { key: string; request: string } | null;
  setAddressId: (id: string | null) => void;
  setPaymentMethod: (m: string) => void;
  keyFor: (request: unknown) => string;
  endAttempt: () => void;
}

export const useCheckout = create<CheckoutState>((set, get) => ({
  addressId: null,
  paymentMethod: "QRIS",
  attempt: null,
  setAddressId: (addressId) => set({ addressId }),
  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
  keyFor: (request) => {
    const fingerprint = JSON.stringify(request);
    const current = get().attempt;
    if (current && current.request === fingerprint) return current.key;
    const key = newKey();
    set({ attempt: { key, request: fingerprint } });
    return key;
  },
  endAttempt: () => set({ attempt: null }),
}));
