import type { OrderStatus } from "@2m/shared";

export const BOARD_COLUMNS = ["PAID", "ACCEPTED", "PICKING", "READY", "ASSIGNED", "ON_DELIVERY"] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export const COLUMN_LABELS: Record<BoardColumn, string> = {
  PAID: "Dibayar",
  ACCEPTED: "Diterima",
  PICKING: "Picking",
  READY: "Siap kirim",
  ASSIGNED: "Ditugaskan",
  ON_DELIVERY: "Dalam pengantaran",
};

// Minutes in a column before a card is highlighted.
export const SLA_MINUTES: Record<BoardColumn, number> = {
  PAID: 5,
  ACCEPTED: 5,
  PICKING: 15,
  READY: 5,
  ASSIGNED: 5,
  ON_DELIVERY: 45,
};

export const BOARD_POLL_MS = 10_000;

export const NEXT_ACTION: Partial<Record<OrderStatus, { to: "ACCEPTED" | "PICKING" | "READY"; label: string }>> = {
  PAID: { to: "ACCEPTED", label: "Terima" },
  ACCEPTED: { to: "PICKING", label: "Mulai picking" },
  PICKING: { to: "READY", label: "Siap kirim" },
};

export function ageMinutes(iso: string | null, now: number): number {
  return iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000)) : 0;
}
