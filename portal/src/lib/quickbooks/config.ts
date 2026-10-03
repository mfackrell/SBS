import "server-only";

import { getServerEnv } from "@/lib/env/server";

export type QuickBooksEnvironment = "sandbox" | "production";

export class QuickBooksConfigurationError extends Error {
  constructor(message = "QuickBooks integration is not configured.") {
    super(message);
    this.name = "QuickBooksConfigurationError";
  }
}

export function isQuickBooksConfigured() {
  const env = getServerEnv();

  return Boolean(
    env.INTUIT_CLIENT_ID &&
      env.INTUIT_CLIENT_SECRET &&
      env.QUICKBOOKS_TOKEN_ENCRYPTION_KEY &&
      env.QUICKBOOKS_STATE_SECRET,
  );
}

export function getQuickBooksConfig() {
  const env = getServerEnv();

  if (
    !env.INTUIT_CLIENT_ID ||
    !env.INTUIT_CLIENT_SECRET ||
    !env.QUICKBOOKS_TOKEN_ENCRYPTION_KEY ||
    !env.QUICKBOOKS_STATE_SECRET
  ) {
    throw new QuickBooksConfigurationError();
  }

  const environment: QuickBooksEnvironment = env.QUICKBOOKS_ENVIRONMENT;

  return {
    clientId: env.INTUIT_CLIENT_ID,
    clientSecret: env.INTUIT_CLIENT_SECRET,
    tokenEncryptionKey: env.QUICKBOOKS_TOKEN_ENCRYPTION_KEY,
    stateSecret: env.QUICKBOOKS_STATE_SECRET,
    webhookVerifierToken: env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN,
    environment,
    appUrl: env.NEXT_PUBLIC_APP_URL,
    authorizationUrl: "https://appcenter.intuit.com/connect/oauth2",
    tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    revokeUrl: "https://developer.api.intuit.com/v2/oauth2/tokens/revoke",
    apiBaseUrl:
      environment === "production"
        ? "https://quickbooks.api.intuit.com"
        : "https://sandbox-quickbooks.api.intuit.com",
  };
}

export function getQuickBooksRedirectUri() {
  const config = getQuickBooksConfig();
  return new URL("/api/integrations/quickbooks/callback", config.appUrl).toString();
}
