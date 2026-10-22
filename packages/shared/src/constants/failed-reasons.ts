export const FAILED_REASONS = ["CUSTOMER_UNREACHABLE", "ADDRESS_NOT_FOUND", "REFUSED", "OTHER"] as const;
export type FailedReason = (typeof FAILED_REASONS)[number];
