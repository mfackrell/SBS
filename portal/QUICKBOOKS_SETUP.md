# QuickBooks Online Integration Setup

The SBS portal includes a read-only QuickBooks Online integration. It uses Intuit OAuth 2.0, stores OAuth tokens encrypted at rest, refreshes them server-side, and syncs a curated financial snapshot into organization-scoped portal tables.

## Customer-facing scope

The integration requests only:

- `com.intuit.quickbooks.accounting`

The portal does not create, edit, delete, or post QuickBooks transactions. QuickBooks Online remains the accounting system of record.

## Intuit developer app

Create or open the SBS app in the Intuit Developer Portal.

Development credentials can be used with an Intuit sandbox company. Production Client ID and Client Secret are available only after the Production Key questionnaire is completed and approved by Intuit.

Current Intuit documentation:

- https://developer.intuit.com/app/developer/qbo/docs/get-started/get-client-id-and-client-secret
- https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0
- https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks/configure-webhooks

## OAuth redirect URI

Register this exact production redirect URI in Intuit:

`https://portal.contract-cfo.com/api/integrations/quickbooks/callback`

For local development, also register the matching local callback, for example:

`http://localhost:3000/api/integrations/quickbooks/callback`

## Vercel environment variables

Add these to the `portal` Vercel project, not the marketing project:

- `INTUIT_CLIENT_ID`
- `INTUIT_CLIENT_SECRET`
- `QUICKBOOKS_ENVIRONMENT` = `sandbox` or `production`
- `QUICKBOOKS_TOKEN_ENCRYPTION_KEY`
- `QUICKBOOKS_STATE_SECRET`
- `QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN` when webhooks are enabled
- `CRON_SECRET` for the scheduled refresh endpoint

`QUICKBOOKS_TOKEN_ENCRYPTION_KEY` must decode to exactly 32 bytes. Use a random 32-byte base64 value or a 64-character hex value.

`QUICKBOOKS_STATE_SECRET` should be a separate random value of at least 32 characters.

Never place the Intuit Client Secret, encryption key, OAuth tokens, state secret, or webhook verifier token in browser-exposed environment variables.

## Webhooks

Production webhook endpoint:

`https://portal.contract-cfo.com/api/integrations/quickbooks/webhook`

Configure Intuit webhooks separately for Development and Production. Copy the Intuit verifier token into `QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN` for the corresponding environment.

The portal verifies `intuit-signature` using HMAC-SHA256 before accepting webhook events. Accepted events mark the relevant QuickBooks company for refresh; the scheduled sync then pulls the current financial reports.

## Scheduled sync

The portal Vercel configuration calls:

`/api/cron/quickbooks-sync`

once per day. A company is refreshed when its data is older than 20 hours or a verified QuickBooks webhook has requested a refresh. Users can also select **Refresh QuickBooks** in the portal.

## Data synced into the client snapshot

The first version reads:

- Profit & Loss, month-to-date
- Profit & Loss, fiscal year-to-date
- Balance Sheet
- A/R aging summary
- A/P aging summary
- Company information used to determine company name and fiscal-year start month

The client portal displays a curated snapshot including revenue, gross profit, net income, cash, A/R, A/P, and fiscal-YTD values. Full QuickBooks reports remain in QuickBooks unless SBS deliberately adds a report-delivery feature later.

## Production activation checklist

1. Create the Intuit app and connect a sandbox company.
2. Add the development OAuth callback URL.
3. Add the development credentials and random encryption/state secrets to a non-production portal environment.
4. Connect a sandbox company from the portal and validate the first sync.
5. Configure and validate the development webhook.
6. Complete Intuit's Production Key questionnaire.
7. After approval, add the production Client ID and Client Secret to Vercel.
8. Set `QUICKBOOKS_ENVIRONMENT=production`.
9. Register the production callback and webhook URLs in Intuit.
10. Run a controlled production connection with an SBS-managed QuickBooks company before enabling customers broadly.
