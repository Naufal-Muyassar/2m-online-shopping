export const COURIER_STATUSES = ["IDLE", "DELIVERING", "OFFLINE"] as const;
export type CourierStatus = (typeof COURIER_STATUSES)[number];
