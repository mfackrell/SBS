# Security checklist

This checklist maps the Phase 8 security pass to the portal implementation.

- [x] All tenant-facing tables use Row Level Security.
- [x] Direct membership, invite, proposal, document-request, document, close-period, and billing mutations are constrained to guarded functions/server flows where the workflow requires them.
- [x] Server actions and API mutations validate input with Zod or fixed typed arguments.
- [x] Organization IDs supplied by the browser are re-authorized against active membership before mutation.
- [x] Client users are redirected away from admin routes.
- [x] No public signup route or `signUp()` call exists.
- [x] Service-role credentials are isolated to server-only modules.
- [x] Lead intake requires a server-to-server shared secret and uses database-backed rate limiting.
- [x] Login, invite creation/resend, and invite acceptance use database-backed rate limiting.
- [x] Cookie-authenticated document POST APIs require a same-origin `Origin` header.
- [x] Next.js Server Actions retain framework origin checks; mutating actions also perform application authorization.
- [x] Message content remains plain text; no rich-text HTML rendering is used.
- [x] Private documents use a private bucket and short-lived signed download URLs.
- [x] Uploads are constrained by organization path, upload intent, MIME allowlist, size limit, and blocked executable/script extensions.
- [x] Security-relevant login/invite/CSRF failures emit structured server logs without logging passwords or secret tokens.
- [x] Global response headers include frame blocking, MIME sniffing protection, same-origin referrer policy, restricted browser permissions, and a minimal CSP for framing/base/form actions.
- [x] Server-side lead routing recomputes outcome/tier rather than trusting the browser-submitted routing result.
- [ ] Malware/virus scanning provider is not yet implemented. The existing hook explicitly reports `scanning_implemented: false`.
- [ ] MFA policy is an owner deployment decision.
- [ ] External security review/penetration testing is outside this implementation phase.

Run the source checks with:

```bash
npm run security:check
```

Run cross-organization authorization and role-boundary tests with the Playwright suite after seeding a local/demo Supabase environment.
