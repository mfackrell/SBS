import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { decryptQuickBooksSecret, encryptQuickBooksSecret } from "./crypto";
import { getQuickBooksConfig } from "./config";
import { refreshQuickBooksToken, type QuickBooksTokenResponse } from "./oauth";

function expiresAt(seconds: number) {
  return new Date(Date.now() + Math.max(0, seconds) * 1000).toISOString();
}

export async function storeQuickBooksCredentials(input: {
  orgId: string;
  tokens: QuickBooksTokenResponse;
  previousRefreshExpiresAt?: string | null;
}) {
  const admin = createAdminSupabaseClient();
  const refreshExpiresAt = input.tokens.x_refresh_token_expires_in
    ? expiresAt(input.tokens.x_refresh_token_expires_in)
    : input.previousRefreshExpiresAt ?? null;

  const { error } = await admin.from("quickbooks_credentials").upsert({
    org_id: input.orgId,
    access_token_ciphertext: encryptQuickBooksSecret(input.tokens.access_token),
    refresh_token_ciphertext: encryptQuickBooksSecret(input.tokens.refresh_token),
    access_expires_at: expiresAt(input.tokens.expires_in),
    refresh_expires_at: refreshExpiresAt,
  });

  if (error) throw new Error(`Unable to store QuickBooks credentials: ${error.message}`);
}

async function refreshStoredQuickBooksToken(orgId: string) {
  const admin = createAdminSupabaseClient();
  const { data: credentials, error } = await admin
    .from("quickbooks_credentials")
    .select("refresh_token_ciphertext,refresh_expires_at")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error || !credentials) throw new Error("QuickBooks refresh credentials are unavailable.");
  if (credentials.refresh_expires_at && new Date(credentials.refresh_expires_at).getTime() <= Date.now()) {
    throw new Error("QuickBooks authorization has expired and must be reconnected.");
  }

  const tokens = await refreshQuickBooksToken(
    decryptQuickBooksSecret(credentials.refresh_token_ciphertext),
  );
  await storeQuickBooksCredentials({
    orgId,
    tokens,
    previousRefreshExpiresAt: credentials.refresh_expires_at,
  });
  return tokens.access_token;
}

export async function getQuickBooksAccess(orgId: string, forceRefresh = false) {
  const admin = createAdminSupabaseClient();
  const [{ data: connection }, { data: credentials }] = await Promise.all([
    admin.from("quickbooks_connections").select("realm_id,status").eq("org_id", orgId).maybeSingle(),
    admin.from("quickbooks_credentials").select("access_token_ciphertext,access_expires_at").eq("org_id", orgId).maybeSingle(),
  ]);

  if (!connection || !credentials) throw new Error("QuickBooks is not connected for this organization.");
  if (connection.status === "disconnected") throw new Error("QuickBooks is disconnected for this organization.");

  const expiresSoon = new Date(credentials.access_expires_at).getTime() <= Date.now() + 120000;
  const accessToken = forceRefresh || expiresSoon
    ? await refreshStoredQuickBooksToken(orgId)
    : decryptQuickBooksSecret(credentials.access_token_ciphertext);

  return { accessToken, realmId: connection.realm_id };
}

async function performGet(input: {
  accessToken: string;
  realmId: string;
  path: string;
  params?: Record<string, string | undefined>;
}) {
  const config = getQuickBooksConfig();
  const url = new URL(
    `/v3/company/${encodeURIComponent(input.realmId)}/${input.path.replace(/^\/+/, "")}`,
    config.apiBaseUrl,
  );
  Object.entries(input.params ?? {}).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  return fetch(url, {
    headers: { Authorization: `Bearer ${input.accessToken}`, Accept: "application/json" },
    cache: "no-store",
  });
}

export async function quickBooksGet<T>(
  orgId: string,
  path: string,
  params?: Record<string, string | undefined>,
) {
  let access = await getQuickBooksAccess(orgId);
  let response = await performGet({ ...access, path, params });
  if (response.status === 401) {
    access = await getQuickBooksAccess(orgId, true);
    response = await performGet({ ...access, path, params });
  }
  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || payload === null) {
    throw new Error(`QuickBooks API request failed with HTTP ${response.status}.`);
  }
  return payload;
}
