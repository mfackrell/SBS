import type { OrgRole } from "@/lib/auth/roles";
import { isStaffRole } from "@/lib/auth/roles";

export type ActiveMembership = {
  org_id: string;
  role: OrgRole;
  status: string;
};

export function activeMembershipForOrg(
  memberships: ActiveMembership[],
  orgId: string,
) {
  return memberships.find(
    (membership) =>
      membership.org_id === orgId && membership.status === "active",
  );
}

export function hasStaffAccess(memberships: ActiveMembership[]) {
  return memberships.some(
    (membership) =>
      membership.status === "active" && isStaffRole(membership.role),
  );
}

export function hasClientAccess(memberships: ActiveMembership[]) {
  return memberships.some(
    (membership) =>
      membership.status === "active" && membership.role === "client",
  );
}

export function canManageOrgFromMemberships(
  memberships: ActiveMembership[],
  orgId: string,
) {
  const membership = activeMembershipForOrg(memberships, orgId);
  return Boolean(membership && isStaffRole(membership.role));
}
