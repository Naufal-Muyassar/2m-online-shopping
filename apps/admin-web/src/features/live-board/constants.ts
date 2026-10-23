export const BOARD_COLUMNS = ["PAID", "ACCEPTED", "PICKING", "ON_DELIVERY"] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

export const COLUMN_LABELS: Record<BoardColumn, string> = {
  PAID: "Perlu diterima",
  ACCEPTED: "Menunggu kurir",
  PICKING: "Sedang disiapkan",
  ON_DELIVERY: "Dalam perjalanan",
};

// Minutes in a column before a card is highlighted.
export const SLA_MINUTES: Record<BoardColumn, number> = {
  PAID: 5,
  ACCEPTED: 5,
  PICKING: 20,
  ON_DELIVERY: 45,
};

export const BOARD_POLL_MS = 10_000;

export function ageMinutes(iso: string | null, now: number): number {
  return iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000)) : 0;
}
