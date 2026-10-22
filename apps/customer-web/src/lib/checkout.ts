import { create } from "zustand";

// Selected delivery address and payment method per checkout session.
interface CheckoutState {
  addressId: string | null;
  paymentMethod: string;
  setAddressId: (id: string | null) => void;
  setPaymentMethod: (m: string) => void;
}

export const useCheckout = create<CheckoutState>((set) => ({
  addressId: null,
  paymentMethod: "QRIS",
  setAddressId: (addressId) => set({ addressId }),
  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
}));
