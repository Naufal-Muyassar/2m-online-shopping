export const ROLES = ["customer", "courier", "branch_admin", "super_admin"] as const;
export type Role = (typeof ROLES)[number];

export type Actor = Role | "system";
