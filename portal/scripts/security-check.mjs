import { readFile, readdir } from "node:fs/promises";
import { extname, relative } from "node:path";

const root = new URL("../src/", import.meta.url);
const failures = [];

async function walk(directoryUrl) {
  const entries = await readdir(directoryUrl, { withFileTypes: true });

  for (const entry of entries) {
    const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directoryUrl);

    if (entry.isDirectory()) {
      await walk(url);
      continue;
    }

    if (![".ts", ".tsx"].includes(extname(entry.name))) continue;

    const source = await readFile(url, "utf8");
    const path = relative(new URL("..", root).pathname, url.pathname);

    if (source.includes("signUp(")) {
      failures.push(`${path}: public signUp() call found`);
    }

    if (source.includes("dangerouslySetInnerHTML")) {
      failures.push(`${path}: dangerouslySetInnerHTML found`);
    }

    if (source.includes('"use client"') || source.includes("'use client'")) {
      for (const marker of [
        "SUPABASE_SERVICE_ROLE_KEY",
        "createAdminSupabaseClient",
        "INTUIT_CLIENT_SECRET",
        "QUICKBOOKS_TOKEN_ENCRYPTION_KEY",
        "QUICKBOOKS_STATE_SECRET",
      ]) {
        if (source.includes(marker)) {
          failures.push(`${path}: server credential/admin marker ${marker} referenced from a client module`);
        }
      }
    }
  }
}

await walk(root);

const nextConfig = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");
for (const header of ["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy", "Content-Security-Policy"]) {
  if (!nextConfig.includes(header)) failures.push(`next.config.ts: missing ${header}`);
}

if (failures.length) {
  console.error("Security source check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Security source check passed.");

const hardeningRequirements = [
  ["app/(auth)/login/actions.ts", "consumePortalRateLimit", "login rate limiting"],
  ["app/(auth)/accept-invite/actions.ts", "consumePortalRateLimit", "invite acceptance rate limiting"],
  ["app/(admin)/admin/organizations/[orgId]/actions.ts", "consumePortalRateLimit", "invite create/resend rate limiting"],
  ["app/(shared)/quickbooks/actions.ts", "consumePortalRateLimit", "QuickBooks connect/sync rate limiting"],
  ["app/api/documents/upload-intent/route.ts", "isSameOriginRequest", "document upload-intent same-origin protection"],
  ["app/api/documents/complete-upload/route.ts", "isSameOriginRequest", "document completion same-origin protection"],
  ["app/api/documents/signed-url/route.ts", "isSameOriginRequest", "document signed-url same-origin protection"],
  ["app/api/lead-intake/route.ts", "determineLeadRouting", "server-derived lead routing"],
  ["app/api/integrations/quickbooks/webhook/route.ts", "timingSafeEqual", "QuickBooks webhook signature verification"],
  ["lib/quickbooks/crypto.ts", "aes-256-gcm", "QuickBooks token encryption"],
  ["lib/quickbooks/state.ts", "timingSafeEqual", "QuickBooks OAuth state signature verification"],
];

for (const [relativePath, marker, description] of hardeningRequirements) {
  const source = await readFile(new URL(`../src/${relativePath}`, import.meta.url), "utf8");
  if (!source.includes(marker)) failures.push(`${relativePath}: missing ${description}`);
}

if (failures.length) {
  console.error("Security hardening regression check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
