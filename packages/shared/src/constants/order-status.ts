import type { Actor } from "./roles";

export const ORDER_STATUSES = [
  "CREATED",
  "PENDING_PAYMENT",
  "PAID",
  "ACCEPTED",
  "PICKING",
  "READY",
  "ASSIGNED",
  "ON_DELIVERY",
  "DELIVERED",
  "FAILED",
  "CANCELLED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const TERMINAL_STATUSES: readonly OrderStatus[] = ["DELIVERED", "FAILED", "CANCELLED"];

export interface TransitionRule {
  from: OrderStatus;
  to: OrderStatus;
  actors: readonly Actor[];
  requires: readonly string[];
}

export const ORDER_TRANSITIONS: readonly TransitionRule[] = [
  { from: "CREATED", to: "PENDING_PAYMENT", actors: ["system"], requires: [] },
  { from: "CREATED", to: "CANCELLED", actors: ["system", "customer"], requires: ["reason"] },
  { from: "PENDING_PAYMENT", to: "PAID", actors: ["system", "super_admin"], requires: [] },
  { from: "PENDING_PAYMENT", to: "CANCELLED", actors: ["system", "customer"], requires: ["reason"] },
  { from: "PAID", to: "ACCEPTED", actors: ["branch_admin"], requires: [] },
  { from: "PAID", to: "CANCELLED", actors: ["branch_admin", "super_admin"], requires: ["reason"] },
  { from: "ACCEPTED", to: "PICKING", actors: ["branch_admin"], requires: [] },
  { from: "ACCEPTED", to: "CANCELLED", actors: ["branch_admin", "super_admin"], requires: ["reason"] },
  { from: "PICKING", to: "READY", actors: ["branch_admin"], requires: [] },
  { from: "PICKING", to: "CANCELLED", actors: ["super_admin"], requires: ["reason"] },
  { from: "READY", to: "ASSIGNED", actors: ["system", "branch_admin"], requires: ["courier_id"] },
  { from: "READY", to: "CANCELLED", actors: ["super_admin"], requires: ["reason"] },
  { from: "ASSIGNED", to: "ON_DELIVERY", actors: ["courier"], requires: ["lat", "lng"] },
  { from: "ASSIGNED", to: "READY", actors: ["system", "branch_admin"], requires: ["audit"] },
  { from: "ON_DELIVERY", to: "DELIVERED", actors: ["courier"], requires: ["proof", "lat", "lng"] },
  { from: "ON_DELIVERY", to: "FAILED", actors: ["courier"], requires: ["reason", "proof_or_note"] },
];

export function findTransition(from: OrderStatus, to: OrderStatus): TransitionRule | undefined {
  return ORDER_TRANSITIONS.find((t) => t.from === from && t.to === to);
}
