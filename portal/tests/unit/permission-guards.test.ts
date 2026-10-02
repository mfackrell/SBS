import { describe, expect, it } from "vitest";
import {
  activeMembershipForOrg,
  canManageOrgFromMemberships,
  hasClientAccess,
  hasStaffAccess,
  type ActiveMembership,
} from "@/lib/auth/permissions";
import { toPortalRole } from "@/lib/auth/roles";

const memberships: ActiveMembership[] = [
  { org_id: "org-a", role: "owner", status: "active" },
  { org_id: "org-b", role: "client", status: "active" },
  { org_id: "org-c", role: "staff", status: "inactive" },
];

describe("permission guard helpers", () => {
  it("recognizes active staff and client access", () => {
    expect(hasStaffAccess(memberships)).toBe(true);
    expect(hasClientAccess(memberships)).toBe(true);
  });

  it("does not treat inactive staff membership as org management access", () => {
    expect(canManageOrgFromMemberships(memberships, "org-c")).toBe(false);
  });

  it("requires a membership in the requested organization", () => {
    expect(activeMembershipForOrg(memberships, "org-z")).toBeUndefined();
    expect(canManageOrgFromMemberships(memberships, "org-z")).toBe(false);
  });

  it("maps owner to the admin application role", () => {
    expect(toPortalRole("owner")).toBe("admin");
    expect(toPortalRole("staff")).toBe("staff");
    expect(toPortalRole("client")).toBe("client");
  });
});
