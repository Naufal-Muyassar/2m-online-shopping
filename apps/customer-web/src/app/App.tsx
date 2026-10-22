import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage, RegisterPage } from "../features/auth/AuthPages";
import { AddressPage } from "../features/address/AddressPage";
import { BranchPicker } from "../features/catalog/BranchPicker";
import { CatalogPage } from "../features/catalog/CatalogPage";
import { CartPage } from "../features/cart/CartPage";
import { CheckoutPage } from "../features/checkout/CheckoutPage";
import { OrderStatusPage } from "../features/orders/OrderStatusPage";
import { PaymentReturnPage } from "../features/orders/PaymentReturnPage";
import { Layout, RequireAuth } from "./Layout";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<Layout />}>
        <Route path="/" element={<BranchPicker />} />
        <Route path="/b/:branchId" element={<CatalogPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/b/:branchId/cart" element={<CartPage />} />
          <Route path="/b/:branchId/address" element={<AddressPage />} />
          <Route path="/b/:branchId/checkout" element={<CheckoutPage />} />
          <Route path="/orders/:orderId" element={<OrderStatusPage />} />
          <Route path="/orders/:orderId/return" element={<PaymentReturnPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
