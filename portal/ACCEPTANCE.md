# Final acceptance checklist

This checklist mirrors the build brief. “Automated E2E” items require a configured seeded Supabase test environment and are not considered passed merely because the test file exists.

- [x] No public signup path exists in application source.
- [ ] Invite-only onboarding works end-to-end. Covered by Playwright critical flow 1; runtime execution required.
- [ ] Lead intake from `/book` is persisted with UTM/routing fields. Server endpoint and bridge are implemented; Playwright critical flow 2 requires runtime execution.
- [ ] Admin can convert lead to organization and invite client. Covered by Playwright critical flow 3; runtime execution required.
- [ ] Staff can create and send proposal. Covered by Playwright critical flow 4; runtime execution required.
- [ ] Client can view and accept proposal. Covered by Playwright critical flow 4; runtime execution required.
- [ ] Document uploads work with private storage and organization isolation. Covered by Playwright critical flows 5 and 6; runtime execution required.
- [ ] Messaging works within organization boundary. Implementation and RLS/function review complete; production/local smoke execution required.
- [ ] Close status is visible to client and editable by staff. Implementation review complete; production/local smoke execution required.
- [x] Billing page is QuickBooks reference/link only; no portal payment processing exists.
- [ ] RLS blocks cross-organization access in tested scenarios. Covered by Playwright critical flow 6; runtime execution required.
- [x] Required audit event write paths exist in database functions/application workflows.
- [x] Accessibility baseline is implemented in source: visible labels, keyboard focus styles, skip navigation, semantic headings/tables, reduced-motion support.
- [ ] Accessibility Playwright baseline executed against a deployed/seeded portal.
- [x] Unit test suite includes validation schemas, permission helpers used by guards, proposal acceptance rules, and lead routing/role helpers.
- [x] Playwright suite includes all seven critical flows required by the brief.
- [x] CI lint/typecheck/unit/security/build job passed on the Phase 8 implementation commit; rerun is required after any later hardening fix before production promotion.
- [ ] Production portal deployment is READY and post-deploy runtime error scan is clean.
