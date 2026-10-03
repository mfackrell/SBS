import "server-only";

import { getQuickBooksConfig, getQuickBooksRedirectUri } from "./config";

export type QuickBooksTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in?: number;
  token_type?: string;
};

function authorizationHeader() {
  const config = getQuickBooksConfig();
  return `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`;
}

async function tokenRequest(params: URLSearchParams) {
  const config = getQuickBooksConfig();
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      Authorization: authorizationHeader(),
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | QuickBooksTokenResponse
    | { error?: string; error_description?: string }
    | null;

  if (!response.ok || !payload || !("access_token" in payload)) {
    const message =
      payload && "error" in payload
        ? [payload.error, payload.error_description].filter(Boolean).join(": ")
        : `HTTP ${response.status}`;
    throw new Error(`QuickBooks OAuth token request failed: ${message}`);
  }

  return payload;
}

export function buildQuickBooksAuthorizationUrl(state: string) {
  const config = getQuickBooksConfig();
  const url = new URL(config.authorizationUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", getQuickBooksRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "com.intuit.quickbooks.accounting");
  url.searchParams.set("state", state);
  return url.toString();
}

export function exchangeQuickBooksAuthorizationCode(code: string) {
  return tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: getQuickBooksRedirectUri(),
    }),
  );
}

export function refreshQuickBooksToken(refreshToken: string) {
  return tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  );
}

export async function revokeQuickBooksToken(token: string) {
  const config = getQuickBooksConfig();
  const response = await fetch(config.revokeUrl, {
    method: "POST",
    headers: {
      Authorization: authorizationHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`QuickBooks token revocation failed with HTTP ${response.status}.`);
  }
}
