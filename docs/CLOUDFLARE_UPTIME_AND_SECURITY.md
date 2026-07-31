# Cloudflare Uptime and Security Operations

Last updated: 2026-07-31

This is the Phase 6 deployment, operations, and extension contract. Cloudflare
performs the uptime probes and remains authoritative for edge settings. The
SiteCare Dashboard owns plan enforcement, incidents, retention, technician
evidence, and customer notifications.

## Required Cloudflare access

Create one long-lived, least-privilege API token for the Agency account. Scope
it only to the managed zones and account used by SiteCare. The deployed token
needs the Cloudflare permissions required to:

- read zones, DNS records, zone settings, DNSSEC, Universal SSL, Bot
  Management, and zone Rulesets;
- read and write Health Checks; and
- read Notifications configuration so SiteCare can verify the configured
  webhook destination and policy.

Cloudflare features and API permissions vary by account plan. A permission or
plan-dependent `403`/`404` for an optional security resource becomes
`Unavailable`, not a false failure. Technicians can record Active or Inactive
evidence with notes while the original API evidence remains preserved.

Do not store the API token in PostgreSQL or paste it into site notes. Supply it
to both the Dashboard and automation worker as deployment configuration.

## Configuration

```text
NUXT_INTEGRATIONS_CLOUDFLARE_API_TOKEN
NUXT_INTEGRATIONS_CLOUDFLARE_API_BASE_URL=https://api.cloudflare.com/client/v4
NUXT_INTEGRATIONS_CLOUDFLARE_ACCOUNT_ID
NUXT_INTEGRATIONS_CLOUDFLARE_WEBHOOK_SECRET
NUXT_INTEGRATIONS_CLOUDFLARE_WEBHOOK_DESTINATION_ID
NUXT_INTEGRATIONS_CLOUDFLARE_NOTIFICATION_POLICY_ID
NUXT_SITECARE_BASE_URL=https://sitecare.adrielpartners.com
```

The webhook secret must be a long random value distinct from the API token.
Cloudflare does not return that secret after setup, so keep the deployment
value in the secret manager. The Dashboard authenticates the
`cf-webhook-auth` header before accepting the payload.

## Cloudflare webhook setup

Create one Cloudflare webhook destination pointing to:

```text
https://sitecare.adrielpartners.com/api/webhooks/cloudflare/health-check
```

Configure its secret to exactly match
`NUXT_INTEGRATIONS_CLOUDFLARE_WEBHOOK_SECRET`. Create and enable a Health Check
status notification policy for the SiteCare Health Checks. Record the resulting
webhook destination and notification policy IDs in the deployment variables.

The Site Detail **Uptime** tab reports setup as ready only when the secret is
configured and Cloudflare returns both an enabled destination and an enabled
Health Check notification policy. The API token never exposes the webhook
secret.

## Monitor behavior

An Admin provisions or repairs a Health Check from Site Detail. SiteCare uses:

- the site's canonical homepage hostname and path;
- HTTP or HTTPS based on the canonical URL;
- a final `2xx` response as success;
- redirect following enabled;
- strict TLS verification;
- one Cloudflare failure/success as the provider state-change threshold; and
- the effective SiteCare normal interval, five minutes by default.

SiteCare Pro and explicit logged entitlement exceptions can provision uptime.
Core and Plus schedules safely skip it. Suspension, cancellation, and effective
downgrade disable the provider check without deleting history.

The first unhealthy state is transient Dashboard state. SiteCare changes only
that Health Check to 60 seconds and sends no email. The per-site 60-second
reconciliation schedule reads Cloudflare's Health Check state; it never probes
the website directly. A second consecutive unhealthy observation opens an
incident and queues recipient-level email. This reconciliation also repairs a
missed webhook.

A successful Cloudflare observation immediately closes an incident, restores
the effective normal interval, and queues a recovery report. TLS/certificate
reasons create a separate email and evidence record and never increment
downtime failures. Failures inside a Dashboard maintenance window are retained
as excluded observations and do not open incidents.

## Retention and reports

Raw uptime observations roll off continuously after 60 days through the
`cloudflare.uptime.retention` automation job. Confirmed incident summaries and
their recovery evidence remain. An automatic recovery report includes start,
recovery, duration, and the notes/backup fields available at recovery time. A
technician can later add successful-recovery notes and a restored backup
reference, then queue an updated report.

Email is delivered only by the Dashboard's transactional notification outbox
to each enabled per-site `uptime` recipient. Telegram and SMS remain visible
non-operational adapter stubs.

## Security Status

The six-hour `cloudflare.security.synchronize` job and the manual **Check
Cloudflare now** action read the approved checklist. The Dashboard never edits
those settings. Status meanings are:

- `Active` (green): the expected control is enabled;
- `Inactive` (red): the control is observably disabled;
- `Pending` (yellow): Cloudflare reports a genuine transitional state, such as
  pending DNSSEC;
- `Review` (yellow): a setting needs judgment, including Security Level above
  Medium; and
- `Unavailable`: the API, account plan, or permission does not expose reliable
  evidence.

Technician evidence is append-only, includes actor/time/notes, supersedes older
technician evidence, and takes precedence in the displayed effective result.
The original Cloudflare result remains queryable.

## Deployment and verification

1. Complete the production PostgreSQL/authentication cutover.
2. Back up PostgreSQL, deploy the Dashboard, and let migration 11 finish.
3. Configure the API token, account ID, webhook secret, destination ID, and
   policy ID in both Dashboard and automation-worker environments.
4. Deploy the Dashboard before exposing the Cloudflare webhook URL.
5. Start the continuous automation and email workers.
6. On one Pro test site, provision the Health Check and synchronize Security
   Status.
7. Confirm the Uptime tab reports webhook readiness.
8. Exercise a controlled non-production failure and verify first-failure
   suppression, second-failure email, recovery email, and interval reset.
9. Inspect the **Automation** page for successful 60-second uptime, six-hour
   security, and daily retention jobs.

## Current limitations

- A live Agency account token was not available during implementation, so the
  first production deployment must complete the capability proof above.
- SiteCare validates existing notification configuration but does not create
  or rotate the Cloudflare webhook destination/policy automatically.
- Cloudflare plan/API availability determines whether APO, Bot Management,
  Managed Rules, and some Health Check notification fields are readable.
- Dashboard maintenance windows are authoritative because Cloudflare does not
  provide a universal maintenance-window source for this workflow.
