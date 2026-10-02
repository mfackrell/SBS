import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRole) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before seeding.");
}

const localTarget = /localhost|127\.0\.0\.1/.test(url);
if (!localTarget && process.env.ALLOW_NONLOCAL_SEED !== "1") {
  throw new Error(
    "Refusing to seed a non-local Supabase project. Set ALLOW_NONLOCAL_SEED=1 only for an intentional demo project.",
  );
}

const admin = createClient(url, serviceRole, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const users = [
  {
    email: process.env.E2E_STAFF_EMAIL ?? "staff@example.test",
    password: process.env.E2E_STAFF_PASSWORD ?? "SbsDevStaff!2026",
    fullName: "SBS Demo Staff",
  },
  {
    email: process.env.E2E_CLIENT_EMAIL ?? "client@example.test",
    password: process.env.E2E_CLIENT_PASSWORD ?? "SbsDevClient!2026",
    fullName: "Demo Client User",
  },
  {
    email: process.env.E2E_OTHER_EMAIL ?? "other@example.test",
    password: process.env.E2E_OTHER_PASSWORD ?? "SbsDevOther!2026",
    fullName: "Other Demo Client",
  },
];

const primaryOrgName = process.env.E2E_ORG_NAME ?? "Demo Client Co";
const otherOrgName = process.env.E2E_OTHER_ORG_NAME ?? "Other Demo Co";

async function findUser(email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;

    const match = data.users.find(
      (user) => user.email?.toLowerCase() === email.toLowerCase(),
    );
    if (match) return match;
    if (data.users.length < 100) break;
  }

  return null;
}

async function ensureUser(definition) {
  const existing = await findUser(definition.email);

  if (existing) {
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
      password: definition.password,
      email_confirm: true,
      user_metadata: {
        ...existing.user_metadata,
        full_name: definition.fullName,
      },
    });
    if (error) throw error;
    return data.user;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: definition.email,
    password: definition.password,
    email_confirm: true,
    user_metadata: { full_name: definition.fullName },
  });

  if (error || !data.user) throw error ?? new Error("User creation failed.");
  return data.user;
}

for (const name of [primaryOrgName, otherOrgName]) {
  const { data: existingOrgs, error } = await admin
    .from("organizations")
    .select("id")
    .eq("name", name);

  if (error) throw error;

  for (const organization of existingOrgs ?? []) {
    const { error: deleteError } = await admin
      .from("organizations")
      .delete()
      .eq("id", organization.id);
    if (deleteError) throw deleteError;
  }
}

const [staffUser, clientUser, otherUser] = await Promise.all(
  users.map(ensureUser),
);

await admin.from("profiles").upsert(
  [
    { user_id: staffUser.id, full_name: users[0].fullName },
    { user_id: clientUser.id, full_name: users[1].fullName },
    { user_id: otherUser.id, full_name: users[2].fullName },
  ],
  { onConflict: "user_id" },
);

const { data: primaryOrg, error: primaryOrgError } = await admin
  .from("organizations")
  .insert({ name: primaryOrgName })
  .select("id,name")
  .single();

if (primaryOrgError) throw primaryOrgError;

const { data: otherOrg, error: otherOrgError } = await admin
  .from("organizations")
  .insert({ name: otherOrgName })
  .select("id,name")
  .single();

if (otherOrgError) throw otherOrgError;

const { error: membershipError } = await admin
  .from("organization_memberships")
  .upsert(
    [
      { org_id: primaryOrg.id, user_id: staffUser.id, role: "owner", status: "active" },
      { org_id: primaryOrg.id, user_id: clientUser.id, role: "client", status: "active" },
      { org_id: otherOrg.id, user_id: staffUser.id, role: "owner", status: "active" },
      { org_id: otherOrg.id, user_id: otherUser.id, role: "client", status: "active" },
    ],
    { onConflict: "org_id,user_id" },
  );

if (membershipError) throw membershipError;

const { error: billingError } = await admin.from("billing_profiles").upsert(
  {
    org_id: primaryOrg.id,
    qbo_customer_ref: "DEMO-QBO-1001",
    qbo_portal_url: "https://example.com/quickbooks-demo",
    notes: "Demo billing reference only. No payment is processed in the SBS portal.",
  },
  { onConflict: "org_id" },
);

if (billingError) throw billingError;

console.log(
  JSON.stringify(
    {
      seeded: true,
      primaryOrg,
      otherOrg,
      users: {
        staff: { email: users[0].email, password: users[0].password },
        client: { email: users[1].email, password: users[1].password },
        other: { email: users[2].email, password: users[2].password },
      },
    },
    null,
    2,
  ),
);
