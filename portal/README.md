# Strategic Business Services client portal

This directory is a standalone Next.js application for the authenticated Strategic Business Services client portal. It is intentionally isolated from the static marketing site in the repository root.

## Architecture through Phase 2

- Next.js App Router + TypeScript
- Supabase Auth and Postgres
- Invite-only authentication; no public signup route
- Multi-tenant organizations with owner, staff and client memberships
- RLS on every application table
- Organization-scoped server guards
- Server-only service-role client isolated from browser modules
- Zod validation and React Hook Form on invite acceptance
- Audit logging for organization and invite/membership lifecycle events
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

For a hosted Supabase project:

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

- `NEXT_PUBLIC_APP_URL`: browser-visible portal origin used for redirects and invite links.
- `NEXT_PUBLIC_SUPABASE_URL`: browser-safe Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: browser-safe Supabase anonymous/publishable key.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only Supabase administrative credential.
- `SUPABASE_JWT_SECRET`: optional; leave unset unless a later server integration needs direct JWT verification.
- `INVITE_EXPIRES_MINUTES`: application invite lifetime. Keep it aligned with Supabase Auth Email OTP Expiration. The default is 60 minutes.
- `SMTP_*`: reserved for a future external email provider. Phase 2 uses Supabase-managed invitation email.
- `RATE_LIMIT_WINDOW_SECONDS` and `RATE_LIMIT_MAX_REQUESTS`: security configuration used beginning with lead/invite endpoint hardening.
- `FILE_UPLOAD_MAX_MB` and `ALLOWED_MIME_TYPES`: document-upload limits used in the documents phase.
- `QBO_BILLING_BASE_URL`: optional reference-link base only. The portal does not process payments.
- `FEATURE_FLAGS`: optional comma-separated feature flags.

## Supabase Auth configuration

Before testing invitations in a hosted environment:

1. Disable public/open signup in Supabase Auth.
2. Set the portal URL as the Site URL.
3. Add `${NEXT_PUBLIC_APP_URL}/accept-invite` to the allowed redirect URLs.
4. Keep Email OTP Expiration aligned with `INVITE_EXPIRES_MINUTES`.
5. Use staff-controlled invitations only.
6. Keep the service-role/secret key server-side.
7. Apply both Phase 1 and Phase 2 migrations before inviting users.

Supabase's admin invitation flow is initiated only from a trusted server using `inviteUserByEmail()`. The invite acceptance screen uses a dedicated browser client configured for the implicit flow because Supabase admin invitation links do not support PKCE. Normal authenticated portal requests continue to use the cookie-based SSR client.

A random one-time portal token is generated for every invite. Only its SHA-256 hash is stored in `public.invites`. The raw token and invite id travel inside the invited user's Supabase Auth metadata rather than in the redirect URL. Acceptance verifies the authenticated user's email, invite id, token hash, expiration, and revocation state before creating or reactivating membership.

## One-time bootstrap for the first portal owner

Organization creation intentionally requires an existing owner/staff membership. For the first internal portal owner only:

1. Create/invite the initial internal user in Supabase Auth.
2. Obtain that auth user's UUID.
3. Run this once in the Supabase SQL editor, replacing the values:

```sql
with new_org as (
  insert into public.organizations (name)
  values ('Strategic Business Services')
  returning id
)
insert into public.organization_memberships (org_id, user_id, role, status)
select id, 'AUTH_USER_UUID'::uuid, 'owner', 'active'
from new_org;
```

After that bootstrap, owner/staff users can create organizations through the portal. Do not expose a bootstrap endpoint in the application.

## Role and organization rules

- `owner`: can manage memberships and invite client, staff, or owner users within that organization.
- `staff`: can manage client memberships and invite client users only.
- `client`: cannot access admin routes or organization-management resources.
- Membership and invite mutation policies are removed from direct Data API access in Phase 2. Mutations go through security-definer functions or server-only admin operations with explicit guards.
- The final active owner of an organization cannot be deactivated or demoted.

## Invitation lifecycle

1. Owner/staff enters an email and allowed role.
2. The database creates an invite and logs `invite.created`.
3. Supabase sends the invitation email.
4. The user opens the invite, creates a password, and activates access.
5. Database acceptance verifies email/token/expiration/revocation and writes `invite.accepted` plus membership activation audit events.
6. Resend rotates the token and expiration and writes `invite.resent` after delivery.
7. Revoke blocks portal activation and writes `invite.revoked`.

Revoking the portal invite prevents membership activation even if an old Supabase email link is later opened. The unaccepted Auth user may still exist in Supabase Auth; without an active membership, login is rejected by the portal.

## Database security posture

All application tables remain RLS-enabled. Phase 2 adds:

- `is_org_owner(org_id)`
- `is_portal_staff()`
- Atomic organization creation with creator owner-membership
- Server-authorized invite create/rotate/revoke/accept functions
- Server-authorized membership updates
- Manager visibility for profiles belonging to managed organizations
- A partial unique index preventing duplicate pending invitations per organization/email
- Last-active-owner protection

Existing helpers remain:

- `auth_user_id()`
- `is_org_member(org_id)`
- `org_role(org_id)`
- `can_manage_org(org_id)`

## Deployment model

Create a separate Vercel project from this same GitHub repository and set **Root Directory** to `portal`. This prevents the portal build from changing the existing static marketing-site deployment.

A portal hostname can be attached later. Routes remain `/login`, `/accept-invite`, `/app/*`, and `/admin/*` relative to that portal host.

## Implemented through Phase 2

- Project structure and dependency scaffolding
- Environment validation and configuration
- Supabase browser/server/admin clients
- Auth session proxy
- Server-side authentication, role and organization guards
- Organization creation
- Organization list/detail views
- Membership role/status management
- Staff-controlled invite creation
- Invite resend and revocation
- Invite acceptance with password creation
- Owner/staff/client permission split
- Required database tables and enums
- RLS enabled on every application table
- Direct membership/invite mutations closed off from browser Data API
- Invite lifecycle and membership audit events
- Client and staff protected layout shells
- Invite-only login

## Pending

Phase 3 and later still need:

- Lead ingestion and marketing-site `/book` integration
- Admin leads inbox and lead-to-organization conversion
- Proposal workflow
- Private document storage and signed URLs
- Messaging and read tracking
- Close status UI/workflow
- QBO billing-reference UI
- Broader workflow audit events
- Rate limiting and spam controls
- Upload enforcement and storage policies
- Unit/E2E tests, accessibility hardening and production deployment
