import { CUSTOMER_STATUS_LABELS, type OrderStatus } from "@2m/shared";

const VARIANT: Record<OrderStatus, string> = {
  CREATED: "pill-warning",
  PENDING_PAYMENT: "pill-warning",
  PAID: "pill-info",
  ACCEPTED: "pill-info",
  PICKING: "pill-primary",
  READY: "pill-primary",
  ASSIGNED: "pill-primary",
  ON_DELIVERY: "pill-primary",
  DELIVERED: "pill-success",
  FAILED: "pill-danger",
  CANCELLED: "pill-danger",
};

export function StatusPill({ status }: { status: OrderStatus }) {
  return <span className={`pill pill-dot ${VARIANT[status]}`}>{CUSTOMER_STATUS_LABELS[status]}</span>;
}
