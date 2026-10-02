# Strategic Business Services website

Static website for Strategic Business Services. The site uses plain HTML5, one shared stylesheet, and vanilla JavaScript. There is no framework, package manager or build step.

## Site structure

- `/index.html`
- `/packages/index.html`
- `/month-end-close/index.html`
- `/controllership/index.html`
- `/ecommerce-accounting/index.html`
- `/how-it-works/index.html`
- `/about/index.html`
- `/consulting/index.html`
- `/book/index.html`
- `/thank-you/index.html`
- `/not-a-fit/index.html`
- `/privacy/index.html`
- `/terms/index.html`
- `/404.html`
- `/assets/css/styles.css`
- `/assets/js/main.js`
- `/assets/js/proof-data.js`
- `/sitemap.xml`
- `/robots.txt`
- `/_redirects`
- `/.htaccess`
- `/OWNER-CHECKLIST.md`

## Configuration

All owner-controlled site values are at the top of `/assets/js/main.js` in `SBS_CONFIG`.

### Entry review

Change `entryOffer.mode` to one of:

- `"complimentary"`
- `"fee"`
- `"off"`

When mode is `"fee"`, set `entryOffer.fee` to the numeric display value without a dollar sign.

### Contact details

Set one canonical set of values under `contact`:

- `phone`
- `phoneHref`
- `email`
- `hours`

Empty values remain hidden throughout the site.

### Logo

The current header uses the text wordmark “Strategic Business Services.” When a verified logo file is available, add it under `/assets/img/` and replace the clearly commented wordmark element in each page header. Keep the dimensions explicit to avoid layout shift.

### Proof and team data

Verified testimonials, credentials, team members and an optional sample-report preview belong in `/assets/js/proof-data.js`. Empty collections do not render.

### Lead form

Set `endpoints.leadFormEndpoint` in `SBS_CONFIG` to the production form or CRM endpoint. The front end sends the full form payload, including UTM values, source data, routing outcome and suggested tier.

A backend or form service is still required for dependable delivery, server-side validation, spam controls and CRM tagging.

Because the site is static and the single source of configuration is JavaScript, a browser with JavaScript disabled cannot read `SBS_CONFIG`. If a no-JavaScript form submission path is required after the production endpoint is selected, mirror that endpoint into the form's HTML `action` attribute during launch preparation.

### Scheduler

Set `endpoints.schedulerEmbedUrl` to the production scheduling embed URL. Until it is configured, qualified submissions receive the neutral scheduling fallback message.

The `booking_confirmed` listener in `main.js` is intentionally a provider stub. Replace the documented event-shape check with the selected scheduling provider's confirmed-booking event before launch.

### Google Analytics 4

Set `analytics.ga4MeasurementId` to the production GA4 measurement ID. Analytics remains unloaded when the value is empty.

If `consentBanner.enabled` is set to `true`, the current code deliberately does not load analytics until a consent implementation is added. Confirm the appropriate consent approach with a qualified reviewer.

Google Search Console should be installed and verified separately.

## Deployment

This project can be served by any static host that supports directory-style clean URLs.

### Netlify

Publish the repository root. The included `_redirects` file is the redirect format intended for Netlify.

### Cloudflare Pages

Publish the repository root with no build command. The included `_redirects` file is compatible with Cloudflare Pages routing rules.

### Apache

Publish the repository root and use the included `.htaccess` template. Apache must permit the required rewrite directives.

### Other static hosts

Publish the repository root and reproduce the rules in `_redirects` using the host's native redirect configuration. Confirm that directory URLs resolve to each folder's `index.html`.

Before moving `contract-cfo.com`, configure the destination host, verify the site on its temporary or preview URL, then update DNS only after the owner-confirmation checklist is complete.

## Redirects

The legacy-domain redirect preserves each path from `tfgboise.com` on `contract-cfo.com`.

The guessed legacy page-name rules in `_redirects` and `.htaccess` are marked for confirmation because the actual historical URL inventory was not supplied. Review the old site's real URLs before launch.

Email forwarding for the legacy domain is controlled by the email host and is not part of this website.

## What has not been tested

The source has been reviewed against the supplied build brief, but the site has not been tested in a browser.

The following have not been measured or tested:

- Browser rendering at 360px, 768px or 1280px
- Lighthouse or Core Web Vitals
- Screen-reader behavior
- Keyboard-only behavior in a browser
- Automated WCAG auditing
- Live form submission to a production endpoint
- Scheduler integration with a production provider
- Redirect behavior on a deployed host
- GA4 event delivery
- Google Search Console
- Real-device behavior

Contrast, accessibility and performance characteristics in the source are design intent, not measured results.


## Portal lead proxy

Phase 3 adds `/api/lead-intake` to the marketing-site deployment. After the proxy environment is configured, set `SBS_CONFIG.endpoints.leadFormEndpoint` in `assets/js/main.js` to `"/api/lead-intake"`. The serverless proxy forwards the submission to the separate portal project's secure lead endpoint.

Set these environment variables on the **marketing-site Vercel project**:

- `PORTAL_LEAD_INTAKE_URL`: full portal endpoint, for example `https://<portal-host>/api/lead-intake`
- `LEAD_INGEST_SHARED_SECRET`: same random server-only value configured on the portal project

Do not put either value into browser JavaScript. The public form uses the same-origin proxy specifically to keep the shared secret server-side.
