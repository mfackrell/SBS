import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { getServerEnv } from "@/lib/env/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { consumePortalRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

const BOOTSTRAP_EMAIL = "mfackrell@contract-cfo.com";
const BOOTSTRAP_ORG_NAME = "Strategic Business Services";

function newInviteToken() {
  return randomBytes(32).toString("base64url");
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST() {
  const allowed = await consumePortalRateLimit(
    "bootstrap_owner_invite",
    BOOTSTRAP_EMAIL,
    { maxAttempts: 3, windowSeconds: 3600 },
  );

  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many bootstrap attempts. Try again later." },
      { status: 429 },
    );
  }

  const admin = createAdminSupabaseClient();

  const { count: membershipCount, error: membershipCountError } = await admin
    .from("organization_memberships")
    .select("id", { count: "exact", head: true });

  if (membershipCountError) {
    return NextResponse.json(
      { ok: false, error: "Unable to verify bootstrap state." },
      { status: 503 },
    );
  }

  if ((membershipCount ?? 0) > 0) {
    return NextResponse.json(
      { ok: false, error: "Owner bootstrap is already complete." },
      { status: 410 },
    );
  }

  const { data: existingOrgs, error: orgLookupError } = await admin
    .from("organizations")
    .select("id,name")
    .order("created_at")
    .limit(2);

  if (orgLookupError) {
    return NextResponse.json(
      { ok: false, error: "Unable to load organization bootstrap state." },
      { status: 503 },
    );
  }

  let orgId: string;

  if ((existingOrgs ?? []).length > 1) {
    return NextResponse.json(
      { ok: false, error: "Bootstrap requires a single initial organization." },
      { status: 409 },
    );
  }

  if (existingOrgs?.[0]) {
    orgId = existingOrgs[0].id;
  } else {
    const { data: organization, error: orgCreateError } = await admin
      .from("organizations")
      .insert({ name: BOOTSTRAP_ORG_NAME, status: "active" })
      .select("id")
      .single();

    if (orgCreateError || !organization) {
      return NextResponse.json(
        { ok: false, error: "Unable to create initial organization." },
        { status: 503 },
      );
    }

    orgId = organization.id;
  }

  await admin
    .from("invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("email", BOOTSTRAP_EMAIL)
    .is("accepted_at", null)
    .is("revoked_at", null);

  const token = newInviteToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const { data: invite, error: inviteError } = await admin
    .from("invites")
    .insert({
      org_id: orgId,
      email: BOOTSTRAP_EMAIL,
      role: "owner",
      invited_by: null,
      token_hash: tokenHash(token),
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (inviteError || !invite) {
    return NextResponse.json(
      { ok: false, error: "Unable to create owner invitation." },
      { status: 503 },
    );
  }

  const env = getServerEnv();
  const { data: delivery, error: deliveryError } =
    await admin.auth.admin.inviteUserByEmail(BOOTSTRAP_EMAIL, {
      data: {
        portal_invite_id: invite.id,
        portal_invite_token: token,
        portal_org_id: orgId,
        portal_role: "owner",
      },
      redirectTo: `${env.NEXT_PUBLIC_APP_URL}/accept-invite`,
    });

  if (deliveryError) {
    await admin
      .from("invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", invite.id);

    return NextResponse.json(
      { ok: false, error: deliveryError.message },
      { status: 503 },
    );
  }

  if (delivery.user?.id) {
    await admin.auth.admin.updateUserById(delivery.user.id, {
      user_metadata: {
        ...delivery.user.user_metadata,
        portal_invite_id: invite.id,
        portal_invite_token: token,
        portal_org_id: orgId,
        portal_role: "owner",
      },
    });
  }

  await admin.from("audit_logs").insert({
    org_id: orgId,
    actor_user_id: null,
    event_type: "bootstrap.owner_invited",
    entity_type: "invite",
    entity_id: invite.id,
    metadata: { email: BOOTSTRAP_EMAIL },
  });

  return NextResponse.json({
    ok: true,
    email: BOOTSTRAP_EMAIL,
    org_id: orgId,
    invite_id: invite.id,
    expires_at: expiresAt,
  });
}


export const GET = POST;
