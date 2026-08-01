# SiteHealth Checkups and Reviews

Last updated: 2026-07-31

## Ownership

A **SiteHealth Checkup** is a durable evidence-collection run. A **SiteHealth
Review** is the versioned report assembled from a completed Checkup.

The WordPress plugin collects bounded local facts and sends them in its signed
check-in. The Dashboard owns Checkup scheduling, evidence history, technician
editing, Review generation, email, external approval records, and cleanup
proposals. The plugin never generates or emails a Review.

## Eligibility and Scheduling

- Admins and Team Members may run a manual Checkup for any authorized site,
  regardless of plan.
- SiteCare Plus and SiteCare Pro receive one automated annual Checkup.
- The first annual Checkup is due 30 days after the site becomes eligible.
- Each later due date is one year after the preceding annual Checkup completes.
- SiteCare Core has no automated annual entitlement.
- Annual-cycle uniqueness, job idempotency, and the normal per-site operation
  lock prevent duplicate work.

The automation worker creates a daily `system:sitehealth-annual` schedule. It
queues `sitehealth.annual.schedule`, which evaluates current entitlements and
queues `sitehealth.checkup.collect` jobs for due sites. Requests do not perform
collection inline.

## Evidence Sources

The collector records source, availability, observed time, a safe summary, and
the normalized value used by the draft.

- Google PageSpeed Insights: desktop/mobile performance, lab metrics, and
  field Core Web Vitals when returned by Google.
- WordPress plugin contract version 3 or newer: published-page metadata, bounded media
  candidates, user display names/roles/registration dates, environment,
  storage, and WordPress-prefix database metrics.
- Existing WordPress update intelligence: core/plugin/theme inventory,
  pending versions, activity, failures, support, and license signals when
  available.
- Hostinger: daily-backup evidence when exposed by the configured account.
- SiteCare: long-term-backup success and failure evidence.
- Cloudflare: Universal SSL evidence from the latest Security Status sync.
- Optional broken links: at most 25 same-origin homepage links, at most five
  redirects, with private or local network destinations rejected.

Unavailable evidence remains explicitly unavailable. In particular, the
system does not infer user inactivity, prove that unattached media is unused,
or infer a successful Hostinger backup when the API omits backup timing.

## WordPress Plugin Rollout

The richer collection requires AP SiteCare plugin `0.4.0` or newer and check-in contract
version `3` or newer. The current plugin 0.5.0 reports contract 4. Older contracts remain accepted during rollout but produce an
explicit unavailable SiteHealth plugin evidence record.

The plugin intentionally excludes user emails, passwords, authentication
material, content bodies, private media contents, and license keys. Collection
is bounded and cached for 12 hours to reduce shared-hosting work.

## Technician Workflow

1. Open **Reports** or a Site Detail **Reports** tab.
2. Queue a manual Checkup and optionally enable the bounded broken-link check.
3. Wait for the automation worker to complete collection.
4. Open the technician workspace.
5. Review evidence availability; edit, dismiss, or add findings and
   recommendations.
6. Edit the title and executive summary.
7. Publish a new immutable Review version.
8. Send it to all enabled per-site recipients subscribed to `sitehealth`.
9. When the client replies outside SiteCare, record the response and notes.
10. If all recommendations were approved, separately mark an approved cleanup
    proposal as technician initiated when work actually begins.

Published versions remain immutable; republishing creates a later version and
supersedes the prior published version. The email tells the client: “Email us
to confirm you want us to proceed with all recommendations.” Replies are not
automatically interpreted.

## Cleanup Boundary

An `approved-all` external response creates approved proposals for the
published recommendations. Partial or declined responses create no executable
work. Phase 8 can record technician initiation but contains no cleanup
executor, no WordPress mutation route, and no Service Time tracking.

## Client Data Boundary

Client routes return only published Reviews for the client's authorized sites.
The response strips raw evidence values, technician identities, and internal
technician notes. Findings, recommendations, evidence availability summaries,
and approval instructions remain visible.

## Configuration

```text
NUXT_INTEGRATIONS_PAGESPEED_API_KEY=
NUXT_INTEGRATIONS_PAGESPEED_API_BASE_URL=https://www.googleapis.com/pagespeedonline/v5/runPagespeed
```

The API key may be blank for initial use. A production key is recommended when
automated volume warrants quota attribution. Email continues to use the global
Brevo configuration; recipients and the `sitehealth` category are configured
per site.

## Schema and APIs

Migration 13 owns the `sitehealth_*` tables described in the architecture.

Operator routes include:

```text
GET  /api/reports
GET  /api/sites/:id/sitehealth
POST /api/sites/:id/sitehealth/checkups
GET  /api/sitehealth/checkups/:checkupId
PUT  /api/sitehealth/checkups/:checkupId/findings
PUT  /api/sitehealth/checkups/:checkupId/recommendations
PATCH /api/sitehealth/checkups/:checkupId/draft
POST /api/sitehealth/checkups/:checkupId/publish
POST /api/sitehealth/reviews/:reviewId/send
POST /api/sitehealth/reviews/:reviewId/approval
POST /api/sitehealth/cleanup/:proposalId/initiate
```

Client routes include:

```text
GET /api/client/sitehealth/reviews
GET /api/client/sitehealth/reviews/:reviewId
GET /api/client/sitehealth/reviews/:reviewId/download
```

## Deployment and Acceptance

Deploy migration 13, the Dashboard, automation worker, and email worker
together. Then:

1. confirm `/api/health` reports a connected database;
2. confirm the automation worker has the daily SiteHealth schedule;
3. distribute current plugin `0.5.0` to a test WordPress site and receive a
   contract version 4 check-in;
4. configure at least one enabled `sitehealth` recipient for that site;
5. run one manual Checkup, review the evidence, publish a Review, and queue its
   email;
6. confirm a client account can see the published Review but cannot retrieve
   raw evidence or internal technician data; and
7. record a test external approval and confirm that no cleanup executes.

The repository-referenced `MODE_NUXT_APP.md` instruction file is still absent.
The architecture, project rules, visual identity, and coding constitution are
the active implementation constraints.
