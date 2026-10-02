import "server-only";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isOrgRole, isStaffRole, type OrgRole } from "./roles";

type Membership = {
  org_id: string;
  role: OrgRole;
  status: string;
};

type AuthContext = {
  user: User;
  memberships: Membership[];
};

async function getAuthContext(): Promise<AuthContext> {
  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    redirect("/login");
  }

  const { data: membershipRows, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("org_id,role,status")
    .eq("user_id", authData.user.id)
    .eq("status", "active");

  if (membershipError) {
    throw new Error("Unable to load portal authorization context.");
  }

  const memberships = (membershipRows ?? [])
    .filter((row): row is { org_id: string; role: string; status: string } =>
      Boolean(row.org_id && row.role && row.status),
    )
    .filter((row) => isOrgRole(row.role))
    .map((row) => ({
      org_id: row.org_id,
      role: row.role,
      status: row.status,
    }));

  return {
    user: authData.user,
    memberships,
  };
}

export async function requireAuthenticatedUser() {
  const context = await getAuthContext();

  if (!context.memberships.length) {
    redirect("/login?error=not-authorized");
  }

  return context;
}

export async function requireStaffUser() {
  const context = await requireAuthenticatedUser();

  if (!context.memberships.some((membership) => isStaffRole(membership.role))) {
    redirect("/app/dashboard");
  }

  return context;
}

export async function requireClientUser() {
  const context = await requireAuthenticatedUser();

  if (!context.memberships.some((membership) => membership.role === "client")) {
    redirect("/admin/dashboard");
  }

  return context;
}

export async function requireOrgMember(orgId: string) {
  const context = await requireAuthenticatedUser();
  const membership = context.memberships.find((item) => item.org_id === orgId);

  if (!membership) {
    redirect("/login?error=not-authorized");
  }

  return {
    ...context,
    orgRole: membership.role,
  };
}

export async function requireOrgManager(orgId: string) {
  const context = await requireOrgMember(orgId);

  if (!isStaffRole(context.orgRole)) {
    redirect("/app/dashboard");
  }

  return context;
}

export async function requireOrgOwner(orgId: string) {
  const context = await requireOrgMember(orgId);

  if (context.orgRole !== "owner") {
    redirect("/admin/dashboard");
  }

  return context;
}
