# WordPress Update Intelligence and Hostinger Visibility

This document is the Phase 5 deployment and extension contract for the
Dashboard, automation worker, and AP SiteCare WordPress plugin 0.3.0.

## What Phase 5 Owns

The Dashboard owns durable connection state, normalized update history,
schedules, stale-state presentation, and audit records. WordPress owns the
installed core, plugin, and theme facts. Hostinger owns shared hosting and its
routine backup/restoration service.

Phase 5 observes software and provider state. It does not install uploaded
packages, restore Hostinger backups, or create SiteCare Pro long-term backups.

## Upgrade Order

1. Complete the production PostgreSQL/authentication cutover if it is still
   pending.
2. Back up PostgreSQL and deploy the Dashboard so migration 10 runs.
3. Deploy the automation worker with the same encryption and Hostinger
   configuration as the Dashboard.
4. Install `dist/ap-sitecare-0.3.0.zip` on connected sites without deleting the
   existing Site ID or Site Secret.
5. Send or wait for one successful plugin check-in. Confirm that the connection
   shows plugin 0.3.0 and contract version 2.
6. Configure the Hostinger Agency API token and run **Sync Hostinger** once.

The plugin remains compatible with an existing version 1 connection while the
Dashboard accepts both contract versions. Detailed inventory appears only
after the first version 2 check-in.

## Connection Lifecycle

- A new or recovered secret is displayed once to an Admin.
- The active secret is encrypted at rest.
- Rotation is due after 180 days.
- The Dashboard repeatedly offers the same pending secret until the plugin uses
  it; it does not create a new secret on every check-in.
- First use promotes the pending secret and places the predecessor in a 14-day
  overlap state.
- The plugin retries with its overlap secret after an authentication failure.
- Revocation rejects all current, pending, and overlap credentials.
- A revoked or unrecoverable site requires an explicit Admin reconnect.
- Every accepted exact request signature is claimed once, preventing replay
  even inside the timestamp freshness window.

Connection views and audit events never return encrypted or raw secrets.

## Plugin Contract Version 2

Each check-in includes:

- plugin and contract version
- homepage URL and observation timestamp
- WordPress core installed/available version
- installed plugins and themes with installed/available version, active state,
  auto-update state, and safe support/license signals where known
- queued update attempts with component identity, prior/result versions,
  outcome, timestamps, source, and a normalized error

The Dashboard validates array sizes and field lengths. It stores detailed
inventory outside the legacy check-in JSON and acknowledges accepted activity
IDs. The plugin removes only acknowledged local events. Vendor integrations may
use the `apsc_plugin_license_status` WordPress filter, but must return only a
safe status label and must never expose keys, tokens, passwords, or account
details.

WordPress hooks provide direct update evidence. A version-baseline comparison
adds reconciliation evidence for manual updates that WordPress performed before
the plugin could observe an attempt. Unknown support or license state remains
unknown; the system does not guess.

## Refresh and Scheduling

The plugin schedules its own normal report every six hours. The Phase 4
automation worker also maintains:

- one `wordpress.refresh` schedule every six hours for each managed site
- one `hostinger.portfolio.synchronize` system schedule every six hours

Manual refresh calls the site's signed `/wp-json/ap-sitecare/v1/refresh`
endpoint and verifies that a newer Dashboard snapshot arrives. The endpoint
only runs update checks and reports observations. It has a direction-specific
HMAC signature, timestamp freshness check, and request-ID replay protection.

Legacy or disconnected plugins become visible as skipped or needs-attention;
the worker does not invent a successful refresh.

## Hostinger Capability Contract

Configure:

```text
NUXT_INTEGRATIONS_HOSTINGER_API_TOKEN
NUXT_INTEGRATIONS_HOSTINGER_API_BASE_URL=https://developers.hostinger.com
```

Synchronization reads hosting websites as the primary portfolio and treats
the WordPress installation resource as optional enrichment. A normalized
domain match strips scheme, path, port, trailing dot, and `www.`. Therefore a
missing Hostinger installation ID does not prevent a match.

The public Hostinger API currently documents shared-hosting website and
WordPress-installation resources, but documents backup operations for VPS
rather than shared hosting. SiteCare records routine backup evidence as
`not-available` when no reliable shared-hosting field exists. That state is not
a backup failure, does not affect the site's update state, and does not enter
the SiteCare Pro long-term backup workflow.

The stored Hostinger management link opens hPanel's Websites area. Hostinger
backup restoration remains a separate external Hostinger responsibility.

## APIs

```text
GET  /api/updates
GET  /api/sites/:id/updates
POST /api/sites/:id/updates/refresh

GET  /api/sites/:id/connection
POST /api/sites/:id/credentials
POST /api/sites/:id/connection/revoke

GET  /api/sites/:id/hostinger
POST /api/admin/integrations/hostinger/synchronize
```

Site reads are authorization-scoped. Issuing/replacing credentials, revoking a
connection, and synchronizing Hostinger are Admin operations.

## Deployment Verification

- Open **Updates** and confirm current, pending, stale, and failure states.
- Open a Site Detail **Updates** tab and inspect component versions and activity.
- Confirm the **Credentials** tab shows plugin/contract version, last use, and
  safe lifecycle rows without a secret.
- Queue a manual refresh and inspect its automation job through verification.
- Run **Sync Hostinger** and confirm domain matching and the management link.
- Confirm unavailable Hostinger daily-backup evidence is informational.
- Verify the Dashboard and automation worker use the same
  `NUXT_CREDENTIAL_ENCRYPTION_KEY` and Hostinger settings.

No production Hostinger token is stored in this repository. The first live
Agency Cloud Pro synchronization is a required deployment verification, not an
application migration blocker.
