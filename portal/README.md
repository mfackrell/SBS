# Strategic Business Services client portal

This directory is a standalone Next.js application for the authenticated Strategic Business Services client portal. It is intentionally isolated from the static marketing site in the repository root.

## Phase 1 architecture

- Next.js App Router + TypeScript
- Supabase Auth, Postgres and later Storage/Edge Functions
- Invite-only authentication posture
- Multi-tenant organizations with owner, staff and client memberships
- Row-level security on every application table
- Server-side route guards for client and staff route groups
- Server-only service-role client isolated from browser modules
- Zod-backed environment and login validation
- No payment collection or public registration

The database role `owner` is the admin-equivalent organization role. Application navigation may describe owner-level users as admins while retaining `owner|staff|client` in the database.

## Local setup

From the repository root:

```bash
cd portal
cp .env.example .env.local
npm install
npm run dev
```

For a local Supabase CLI workflow:

```bash
supabase start
supabase db reset
```

For a hosted Supabase project, link the project and push migrations:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Then run:

```bash
npm run lint
npm run typecheck
npm run build
```

## Environment variables

- `NEXT_PUBLIC_APP_URL`: browser-visible portal origin used for redirects and links.
- `NEXT_PUBLIC_SUPABASE_URL`: browser-safe Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: browser-safe Supabase anonymous/publishable key.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only administrative Supabase credential. Never import it into client code.
- `SUPABASE_JWT_SECRET`: optional; leave unset unless a later server integration needs direct JWT verification.
- `SMTP_*`: reserved for a future external invite-email provider. Supabase-managed email may be used instead.
- `RATE_LIMIT_WINDOW_SECONDS` and `RATE_LIMIT_MAX_REQUESTS`: security configuration used beginning with lead/invite endpoints.
- `FILE_UPLOAD_MAX_MB` and `ALLOWED_MIME_TYPES`: document-upload limits used in the documents phase.
- `QBO_BILLING_BASE_URL`: optional reference-link base only. The portal does not process payments.
- `FEATURE_FLAGS`: optional comma-separated feature flags.

## Supabase Auth configuration

Before using a hosted environment:

1. Disable public/open signup in Supabase Auth.
2. Configure the portal URL and approved redirect URLs.
3. Use staff-controlled invitations only.
4. Keep the service-role key server-side.
5. Apply the Phase 1 migration before inviting users.

The login action uses password sign-in only and exposes no registration action. Invite acceptance and membership activation are implemented in Phase 2.

## Database security posture

The Phase 1 migration creates the required schema and enables RLS on every application table. Lead tables have no direct authenticated policies and are therefore denied by default. Tenant tables use centralized membership helpers for read access, while mutation policies are intentionally conservative until each workflow is implemented.

Security helper functions:

- `auth_user_id()`
- `is_org_member(org_id)`
- `org_role(org_id)`
- `can_manage_org(org_id)`

The `SECURITY DEFINER` helpers are limited to membership checks, use a fixed `search_path`, and expose only boolean/role lookup behavior.

## Deployment model

Create a separate Vercel project from this same GitHub repository and set **Root Directory** to `portal`. This prevents the portal build from changing the existing static marketing-site deployment.

A portal hostname can be attached later after owner approval. The application routes remain `/login`, `/app/*`, and `/admin/*` relative to that portal host.

## Implemented in Phase 1

- Project structure and dependency scaffolding
- Environment validation and configuration
- Supabase browser/server/admin clients
- Next.js proxy session refresh
- Server-side authentication and role guards
- Organization, membership and role model
- Required database tables and enums
- Foreign-key and high-query indexes
- RLS enabled on every application table
- Initial membership-scoped policies with deny-by-default behavior
- Profile creation trigger for invited auth users
- Client and staff protected layout shells
- Invite-only login page and login server action

## Pending

Phase 2 and later still need:

- Organization creation UI and membership management
- Invite create/revoke/accept lifecycle and audit events
- Lead ingestion and marketing-site integration
- Proposal workflow
- Private document storage and signed URLs
- Messaging and read tracking
- Close status UI/workflow
- QBO billing-reference UI
- Full audit-event writing
- Rate limiting, upload enforcement and storage policies
- Unit/E2E tests, accessibility hardening and production deployment
