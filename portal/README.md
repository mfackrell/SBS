# Strategic Business Services client portal

This directory is a standalone Next.js application for the authenticated Strategic Business Services client portal. It is intentionally isolated from the static marketing site in the repository root.

## Architecture through Phase 5

- Next.js App Router + TypeScript
- Supabase Auth and Postgres
- Invite-only authentication; no public signup route
- Multi-tenant organizations with owner, staff and client memberships
- RLS on every application table
- Organization-scoped server guards
- Server-only service-role client isolated from browser modules
- Zod validation and React Hook Form on invite acceptance
- Audit logging for organization, invite/membership, and lead lifecycle events
- Secure marketing-site lead ingestion through a shared-secret server proxy
- Database-backed lead rate limiting and 15-minute exact-duplicate suppression
- Admin lead inbox, detail history, status workflow, and lead-to-organization conversion
- Versioned proposal builder with locked sent versions
- Client proposal review, typed acceptance, decline, and immutable acceptance snapshots
- Proposal lifecycle audit events
- Private document requests, uploads, deliverables, signed downloads, and revision metadata
- Private Supabase Storage bucket with org-path upload policy and no public read policy
- Clearly marked virus-scanning integration hook that is not yet a scanning control
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
- `LEAD_INGEST_SHARED_SECRET`: random server-only secret shared only by the marketing proxy and portal ingestion endpoint. Use at least 32 characters.
- `LEAD_RATE_LIMIT_SALT`: separate random server-only value used to HMAC client IP/user-agent fingerprints before rate-limit storage.
- `SMTP_*`: reserved for a future external email provider. Phase 2 uses Supabase-managed invitation email.
- `RATE_LIMIT_WINDOW_SECONDS` and `RATE_LIMIT_MAX_REQUESTS`: security configuration used beginning with lead/invite endpoint hardening.
- `FILE_UPLOAD_MAX_MB` and `ALLOWED_MIME_TYPES`: document-upload limits. Keep `FILE_UPLOAD_MAX_MB` at or below the private bucket's 25 MB hard cap. The application and bucket both restrict uploads to PDF, CSV, XLSX, DOCX, PNG, and JPG/JPEG MIME types.
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

## Marketing-site lead integration

Phase 3 adds a same-origin `/api/lead-intake` function to the marketing project. After the server environment is configured, set `SBS_CONFIG.endpoints.leadFormEndpoint` in the marketing site's `assets/js/main.js` to `"/api/lead-intake"`. That function contains no Supabase credentials. It forwards the validated request boundary to the portal's `POST /api/lead-intake` route and adds the server-only shared secret.

Configure the **marketing-site Vercel project** with:

- `PORTAL_LEAD_INTAKE_URL=https://YOUR_PORTAL_HOST/api/lead-intake`
- `LEAD_INGEST_SHARED_SECRET=<same random value used by the portal>`

Configure the **portal Vercel project** with:

- `LEAD_INGEST_SHARED_SECRET=<same value>`
- `LEAD_RATE_LIMIT_SALT=<different random value>`
- the existing Supabase variables

Until `PORTAL_LEAD_INTAKE_URL` and the shared secret are set on the marketing project, leave the browser endpoint disabled. The proxy itself intentionally returns HTTP 503 when unconfigured.

The portal ingestion endpoint validates the request with Zod, requires consent, silently drops populated honeypots with HTTP 200, applies a database-backed rate limit, suppresses an exact duplicate within 15 minutes, writes the lead, writes `lead_events`, and returns `{ ok, lead_id }`.

## Lead conversion

Staff can filter `/admin/leads` by `new`, `contacted`, `converted`, or `not_fit`, open a lead detail page, update status, and convert a lead into an organization.

Conversion:

1. Atomically creates the organization and grants the converting staff user owner access to that organization.
2. Marks the lead converted and links `converted_org_id`.
3. Writes lead and organization audit events.
4. Optionally creates and sends a client invitation for the lead's primary contact.
5. Sets `organizations.primary_contact_id` to the invited Auth user when that invitation succeeds.

## Proposal workflow

Phase 4 uses a **locked-after-send + explicit new-version** policy:

1. Staff creates a draft proposal.
2. Draft title, expiration, line items, pricing, and terms can be edited.
3. Sending changes the version to `sent`, records `sent_at`, makes it visible to client members, and locks that version.
4. A sent/viewed/declined/expired version can be copied into a new draft version. Accepted proposals cannot be versioned.
5. Sending a new version marks older open sent/viewed versions in the same proposal series as expired.
6. The database enforces one accepted version per proposal series.

“Send” in Phase 4 means make the locked proposal version available in the authenticated client portal. No proposal-email provider is added in this phase.

Client proposal views automatically record the first `viewed` transition. Acceptance requires an explicit acceptance-statement checkbox plus typed full name. The database records:

- authenticated user id and email
- typed accepted name
- acceptance timestamp
- IP address when available
- user agent when available
- fixed acceptance-statement text
- immutable JSON snapshot containing proposal identity, version, total, terms, expiration, and all line items

The acceptance snapshot is stored separately in `proposal_acceptances`. Direct browser mutation policies for proposals and line items are removed; staff edits/sends/versioning and client accept/decline actions go through guarded database functions.

Proposal lifecycle audit events include `proposal.created`, `proposal.updated`, `proposal.sent`, `proposal.viewed`, `proposal.accepted`, `proposal.declined`, and `proposal.expired`.

There is no payment collection and no third-party e-signature provider in this phase.

## Documents and requests

Phase 5 creates the private Supabase Storage bucket `private-documents`. Its path convention is:

```text
org/{org_id}/documents/{document_id}/{filename}
```

The bucket is private. There is no authenticated `SELECT` policy on `storage.objects`; downloads are issued only as short-lived signed URLs after the application confirms the document row is visible to the authenticated user's organization. The storage insert policy limits direct authenticated uploads to an active member's organization path. The implemented portal uploader uses a server-authorized signed upload token and never exposes a public bucket URL.

Upload flow:

1. Browser sends file metadata to `POST /api/documents/upload-intent`.
2. Zod validates the request. The server checks configured file-size limit, allowed MIME type, organization membership, category permissions, request scope, and optional revision target.
3. The server creates a short-lived database upload intent and a signed Supabase upload token for a new immutable document path.
4. Browser uploads directly to the private bucket with `uploadToSignedUrl`.
5. Browser calls `POST /api/documents/complete-upload`.
6. The database verifies the storage object exists, writes document metadata, revision/uploader/timestamp data, document access log, and `document.uploaded` audit event.
7. Client uploads attached to an open request move that request to `submitted`.

Document revisions receive a new document id and a new storage path. `document_series_id`, `revision`, and `supersedes_document_id` retain the version chain; stored objects are never overwritten in place.

Download flow:

- `POST /api/documents/signed-url` authorizes the document through RLS.
- The server creates a 60-second signed URL using the service-role Storage client.
- `document.downloaded` and `document_access_logs` are recorded before the URL is returned.

Staff deletion is a soft delete in Postgres followed by private-object cleanup. The metadata and audit evidence remain retained while the deleted row becomes invisible through normal document RLS.

### Virus scanning status

**TODO: malware/virus scanning is not implemented yet.** `src/lib/security/virus-scan.ts` is an explicit provider-neutral hook for the production scanning integration. It currently emits a structured internal event stating `scanning_implemented: false`. MIME allowlisting, size limits, private storage, and blocked executable/script extensions are implemented, but none of those should be represented as malware scanning.

## Deployment model

Create a separate Vercel project from this same GitHub repository and set **Root Directory** to `portal`. This prevents the portal build from changing the existing static marketing-site deployment.

A portal hostname can be attached later. Routes remain `/login`, `/accept-invite`, `/app/*`, and `/admin/*` relative to that portal host.

## Implemented through Phase 5

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
- Typed lead-intake request/response contract
- Secure `POST /api/lead-intake`
- Marketing-site same-origin lead proxy
- Honeypot and database-backed rate limiting
- Exact-duplicate suppression
- Lead + UTM/routing persistence
- Admin leads inbox with status filters
- Lead detail/event history
- Lead status management
- Lead-to-organization conversion
- Optional primary-contact invitation on conversion
- Typed proposal create/update/send/accept/decline contracts
- Admin proposal list, create flow, and line-item builder
- Locked sent proposal versions with explicit new-version creation
- Client proposal list and proposal detail view
- First-view tracking
- Explicit typed acceptance and optional decline reason
- Immutable accepted proposal snapshot
- One accepted version per proposal series enforcement
- Proposal lifecycle audit events
- Staff document-request create/status workflow
- Client request list and requested-document upload
- Staff deliverable upload
- Private `private-documents` Storage bucket
- Org-scoped storage upload policy
- Typed upload-intent, upload-completion, and signed-download contracts
- Server-authorized signed upload tokens
- Short-lived signed download URLs
- MIME and configurable file-size validation
- Executable/script extension blocking
- Immutable document storage paths
- Revision series, uploader, and timestamp metadata
- Upload/download/delete access logs and audit events
- Staff soft-delete + storage cleanup
- Explicit virus-scanning TODO hook

## Pending

Phase 6 and later still need:

- Messaging and read tracking
- Close status UI/workflow
- QBO billing-reference UI
- Broader workflow audit events
- Rate limiting and spam controls
- Upload enforcement and storage policies
- Unit/E2E tests, accessibility hardening and production deployment
