import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const baseURL = process.env.E2E_BASE_URL ?? "";
const supabaseUrl =
  process.env.E2E_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const leadSecret = process.env.LEAD_INGEST_SHARED_SECRET ?? "";

const staffEmail = process.env.E2E_STAFF_EMAIL ?? "staff@example.test";
const staffPassword = process.env.E2E_STAFF_PASSWORD ?? "SbsDevStaff!2026";
const clientEmail = process.env.E2E_CLIENT_EMAIL ?? "client@example.test";
const clientPassword = process.env.E2E_CLIENT_PASSWORD ?? "SbsDevClient!2026";
const otherEmail = process.env.E2E_OTHER_EMAIL ?? "other@example.test";
const otherPassword = process.env.E2E_OTHER_PASSWORD ?? "SbsDevOther!2026";
const orgName = process.env.E2E_ORG_NAME ?? "Demo Client Co";

const ready = Boolean(baseURL && supabaseUrl && serviceRole && leadSecret);
const admin = ready
  ? createClient(supabaseUrl, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function clearSession(page: Page) {
  await page.context().clearCookies();
  await page.goto("/login");
}

async function orgIdByName(name: string) {
  if (!admin) throw new Error("E2E admin client is unavailable.");

  const { data, error } = await admin
    .from("organizations")
    .select("id")
    .eq("name", name)
    .single();

  if (error) throw error;
  return data.id as string;
}

let leadId = "";
let leadCompany = "";
let proposalId = "";

test.describe.serial("required critical portal flows", () => {
  test.skip(!ready, "Set E2E_BASE_URL, Supabase service-role variables, and LEAD_INGEST_SHARED_SECRET.");

  test("1. staff invite -> client accepts invite -> can log in", async ({ page }) => {
    if (!admin) throw new Error("E2E admin client is unavailable.");

    const orgId = await orgIdByName(orgName);
    const invitedEmail = `invite-${Date.now()}@example.test`;
    const invitedPassword = "SbsInvitedClient!2026";

    await login(page, staffEmail, staffPassword);
    await page.goto(`/admin/organizations/${orgId}`);
    await page.getByLabel("Email").fill(invitedEmail);
    await page.getByLabel("Role").selectOption("client");
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByRole("status")).toContainText("Invitation sent.");

    const { data: linkData, error: linkError } =
      await admin.auth.admin.generateLink({
        type: "magiclink",
        email: invitedEmail,
        options: { redirectTo: `${baseURL}/accept-invite` },
      });

    if (linkError || !linkData.properties?.action_link) {
      throw linkError ?? new Error("Could not generate local invite-test link.");
    }

    await page.goto(linkData.properties.action_link);
    await page.waitForURL(/\/accept-invite/);
    await page.getByLabel("Full name").fill("Invited E2E Client");
    await page.getByLabel("Create password").fill(invitedPassword);
    await page.getByLabel("Confirm password").fill(invitedPassword);
    await page.getByRole("button", { name: "Activate portal access" }).click();
    await expect(page).toHaveURL(/\/app\/dashboard/);

    await clearSession(page);
    await login(page, invitedEmail, invitedPassword);
    await expect(page).toHaveURL(/\/app\/dashboard/);
  });

  test("2. lead intake POST -> lead visible in admin", async ({ page, request }) => {
    leadCompany = `E2E Lead ${Date.now()}`;
    const leadEmail = `lead-${Date.now()}@example.test`;

    const response = await request.post("/api/lead-intake", {
      headers: {
        "x-sbs-lead-secret": leadSecret,
        "x-sbs-client-ip": "203.0.113.40",
        "user-agent": "SBS E2E",
      },
      data: {
        name: "E2E Lead",
        email: leadEmail,
        phone: "",
        company: leadCompany,
        website: "",
        annual_revenue_range: "$500K–$1M",
        business_type: "Service business",
        accounting_software: "QuickBooks Online",
        monthly_transactions: "50–100",
        legal_entities: "1",
        sales_channels: [],
        books_state: "Current",
        start_timing: "Within 30 days",
        consent: true,
        website_confirm: "",
        landing_page: `${baseURL}/book/`,
        referrer: "",
        routing_outcome: "custom_scope",
        suggested_tier: "Platinum",
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.lead_id).toBeTruthy();
    leadId = body.lead_id;

    await login(page, staffEmail, staffPassword);
    await page.goto("/admin/leads");
    await expect(page.getByText(leadCompany)).toBeVisible();
  });

  test("3. convert lead -> organization created + invite sent", async ({ page }) => {
    expect(leadId).toBeTruthy();

    await login(page, staffEmail, staffPassword);
    await page.goto(`/admin/leads/${leadId}`);
    await expect(page.getByLabel(/Invite .* as the primary client contact/)).toBeChecked();
    await page.getByRole("button", { name: "Convert lead" }).click();

    await expect(page).toHaveURL(/\/admin\/organizations\/[0-9a-f-]{36}/i);
    await expect(page.getByRole("status")).toContainText(/Lead converted/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(leadCompany);
  });

  test("4. create/send proposal -> client accepts -> status locked", async ({ page }) => {
    const title = `E2E Proposal ${Date.now()}`;

    await login(page, staffEmail, staffPassword);
    await page.goto("/admin/proposals");
    await page.getByLabel("Organization").selectOption({ label: orgName });
    await page.getByLabel("Title").fill(title);
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page).toHaveURL(/\/admin\/proposals\/[0-9a-f-]{36}/i);

    proposalId = page.url().match(/\/admin\/proposals\/([0-9a-f-]{36})/i)?.[1] ?? "";
    expect(proposalId).toBeTruthy();

    await page.getByLabel("Service").fill("Monthly close");
    await page.getByLabel("Qty").fill("1");
    await page.getByLabel("Unit price").fill("1500");
    await page.getByLabel("Terms").fill("E2E proposal terms.");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByRole("status")).toContainText("Draft saved.");

    await page.getByRole("button", { name: "Send proposal" }).click();
    await expect(page.getByRole("status")).toContainText("Proposal sent");

    await clearSession(page);
    await login(page, clientEmail, clientPassword);
    await page.goto(`/app/proposals/${proposalId}`);
    await page.getByRole("checkbox").check();
    await page.getByLabel("Type your full name").fill("Demo Client User");
    await page.getByRole("button", { name: "Accept proposal" }).click();
    await expect(page.getByRole("heading", { name: "Accepted" })).toBeVisible();

    await clearSession(page);
    await login(page, staffEmail, staffPassword);
    await page.goto(`/admin/proposals/${proposalId}`);
    await expect(page.getByText("accepted", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send proposal" })).toHaveCount(0);
  });

  test("5. client uploads document -> staff can view metadata", async ({ page }) => {
    const requestTitle = `E2E Records ${Date.now()}`;
    const fileName = `e2e-records-${Date.now()}.csv`;

    await login(page, staffEmail, staffPassword);
    await page.goto("/admin/requests");
    await page.getByLabel("Organization").selectOption({ label: orgName });
    await page.getByLabel("Request title").fill(requestTitle);
    await page.getByRole("button", { name: "Create request" }).click();
    await expect(page).toHaveURL(/\/admin\/requests\/[0-9a-f-]{36}/i);
    const requestUrl = page.url();

    await clearSession(page);
    await login(page, clientEmail, clientPassword);
    await page.goto("/app/requests");

    const requestCard = page.locator("article.request-card").filter({ hasText: requestTitle });
    await expect(requestCard).toBeVisible();
    await requestCard.locator('input[type="file"]').first().setInputFiles({
      name: fileName,
      mimeType: "text/csv",
      buffer: Buffer.from("account,amount\nSales,100\n"),
    });
    await expect(requestCard).toContainText(fileName);

    await clearSession(page);
    await login(page, staffEmail, staffPassword);
    await page.goto(requestUrl);
    await expect(page.getByText(fileName)).toBeVisible();
    await expect(page.getByText(/Revision 1/)).toBeVisible();
  });

  test("6. non-member cannot access another organization's proposal", async ({ page }) => {
    expect(proposalId).toBeTruthy();

    await login(page, otherEmail, otherPassword);
    const response = await page.goto(`/app/proposals/${proposalId}`);
    expect(response?.status()).toBe(404);
  });

  test("7. client cannot access admin routes", async ({ page }) => {
    await login(page, clientEmail, clientPassword);
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/app\/dashboard/);
  });
});
