# Portal deployment runbook

The portal is a separate Next.js application under `portal/`. Do not deploy it over the static marketing-site project.

## 1. Create the Supabase project

1. Create a dedicated Supabase project for the SBS portal.
2. Record the project URL, browser-safe anon/publishable key, and service-role key.
3. In Auth settings:
   - disable public/open signup;
   - set the portal production origin as the Site URL;
   - allow `<portal-origin>/accept-invite` as a redirect URL;
   - keep email OTP/invite expiration aligned with `INVITE_EXPIRES_MINUTES`.
4. Use Supabase-managed invitation email unless a separate SMTP provider is intentionally configured.

## 2. Apply database migrations

From `portal/`:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Verify every migration through Phase 8 is applied in timestamp order.

For a local environment:

```bash
supabase start
supabase db reset
npm run seed:dev
```

The dev seed refuses a non-local project unless `ALLOW_NONLOCAL_SEED=1` is explicitly set.

## 3. Storage

The Phase 5 migration creates and configures the private `private-documents` bucket. Verify:

- bucket is private;
- 25 MB bucket hard cap;
- allowed MIME types match the approved list;
- authenticated upload policy requires organization membership and a matching unexpired upload intent;
- no authenticated public-read policy exists.

## 4. Vercel project

Create a **separate Vercel project** from the `mfackrell/SBS` repository.

Set:

- Root Directory: `portal`
- Framework preset: Next.js
- Production branch: `main`

Do not reuse the marketing project whose root is the repository root.

## 5. Portal environment variables

Set these in Vercel Production and the environments where the portal is tested:

```text
NEXT_PUBLIC_APP_URL=https://<portal-host>
NEXT_PUBLIC_SUPABASE_URL=<supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<browser-safe-key>
SUPABASE_SERVICE_ROLE_KEY=<server-only-key>

INVITE_EXPIRES_MINUTES=60
LEAD_INGEST_SHARED_SECRET=<32+ random characters>
LEAD_RATE_LIMIT_SALT=<32+ random characters>
SECURITY_RATE_LIMIT_SALT=<32+ random characters>

RATE_LIMIT_WINDOW_SECONDS=60
RATE_LIMIT_MAX_REQUESTS=20
FILE_UPLOAD_MAX_MB=25
ALLOWED_MIME_TYPES=application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg

QBO_BILLING_BASE_URL=
FEATURE_FLAGS=
```

`SUPABASE_SERVICE_ROLE_KEY`, the shared secret, and salts are server-only. Never prefix them with `NEXT_PUBLIC_`.

## 6. Marketing-site lead bridge

On the marketing-site Vercel project set:

```text
PORTAL_LEAD_INTAKE_URL=https://<portal-host>/api/lead-intake
LEAD_INGEST_SHARED_SECRET=<same shared secret as portal>
```

Only after both values are configured and the portal endpoint passes a smoke test, set this in the marketing site's `assets/js/main.js`:

```js
leadFormEndpoint: "/api/lead-intake"
```

## 7. Pre-production checks

From `portal/`:

```bash
npm install
npm run lint
npm run typecheck
npm run test:unit
npm run security:check
npm run build
```

For a seeded local/demo environment:

```bash
npm run seed:dev
E2E_BASE_URL=http://127.0.0.1:3000 npm run test:e2e
```

Provide the Supabase service-role and lead-ingest variables required by the E2E suite.

## 8. Production smoke tests

After deployment verify:

1. `/login` loads and there is no signup path.
2. Staff can sign in.
3. Client can sign in.
4. Client cannot open `/admin/dashboard`.
5. Staff can open organizations/leads/proposals/requests/messages.
6. Client can open documents/requests/messages/proposals/close status/billing/settings.
7. Create and revoke a test invite.
8. Submit a controlled lead through the portal lead endpoint.
9. Confirm cross-organization data is not readable.
10. Upload/download a harmless test CSV and confirm the signed URL expires.
11. Check Vercel runtime errors after the smoke test.

## 9. Migration rollback notes

Database migrations are forward-oriented. Before a production migration:

- take a Supabase database backup or confirm PITR/backup availability;
- deploy database changes before application code that depends on them;
- do not delete historical proposal acceptance snapshots, audit records, or document metadata during rollback.

If a migration fails before commit, fix the migration and rerun it. Each portal migration uses a transaction where supported.

If a migration succeeds but the application deployment fails, keep the additive database migration in place and roll the Vercel application back to the previous deployment. The Phase 2–8 migrations are designed primarily as additive changes plus policy/function replacement.

For a destructive rollback, write and review an explicit compensating migration rather than manually editing production tables.

## 10. Production promotion

Use a validated preview first when possible. After smoke tests pass, promote that exact artifact to production rather than rebuilding a different artifact.


## Provisioned production backend

The production Supabase backend has been created and all portal migrations have been applied.

- Project name: `SBS Portal`
- Project ref: `ltgpugmzibthflrozmce`
- Region: `us-east-1`
- API URL: `https://ltgpugmzibthflrozmce.supabase.co`
- Public schema tables: provisioned with RLS enabled
- Storage: private document bucket provisioned
- Production ACL hardening migrations: applied
- Latest verified application CI: lint, typecheck, unit tests, security checks, and production build passing

Do not commit the Supabase service-role/secret key or application security salts to Git.

### Remaining Vercel provisioning

Create a separate Vercel project for this repository with:

- Repository: `mfackrell/SBS`
- Project name: recommended `sbs-portal`
- Root Directory: `portal`
- Framework: Next.js

Do **not** repoint the existing `contract-cfo` project; that project serves the public marketing site.

After the portal project is created, configure the environment variables from `.env.example`, set `NEXT_PUBLIC_APP_URL` to the portal production URL, then add that production URL to the Supabase Auth site/redirect configuration.

Finally configure the existing marketing-site Vercel project with:

- `PORTAL_LEAD_INTAKE_URL=https://<portal-host>/api/lead-intake`
- `LEAD_INGEST_SHARED_SECRET=<same value configured on the portal>`

Then enable `SBS_CONFIG.endpoints.leadFormEndpoint = "/api/lead-intake"` in the marketing site's `assets/js/main.js`.
