export const ORG_ROLES = ["owner", "staff", "client"] as const;

export type OrgRole = (typeof ORG_ROLES)[number];
export type PortalRole = "admin" | "staff" | "client";

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === "string" && ORG_ROLES.includes(value as OrgRole);
}

export function isStaffRole(role: string): role is "owner" | "staff" {
  return role === "owner" || role === "staff";
}

export function toPortalRole(role: OrgRole): PortalRole {
  if (role === "owner") return "admin";
  return role;
}
