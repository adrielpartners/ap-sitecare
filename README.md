# AP SiteCare

AP SiteCare is Adriel Partners' internal operations dashboard for managed
WordPress websites. The dashboard is the product; the WordPress plugin is a
lightweight reporting agent.

## Current Baseline

Version One is complete through Phase 11:

- managed-site registration and credentials
- signed WordPress reporter check-ins
- operational health dashboard
- audit history and operational context
- read-only external provider visibility
- inspection-and-proposal agent APIs
- action-request review
- inspection-and-proposal MCP tools
- application-owned email/password authentication
- Admin, Team Member, and Client authorization
- revocable sessions with a 72-hour inactivity limit and 30-day renewable cap
- email MFA with 30-day remembered devices and fresh high-risk step-up
- invitation and password-recovery email outbox with Brevo delivery
- client accounts, site ownership, and a safe Client Dashboard shell
- immutable SiteCare Core, Plus, and Pro plans with centralized entitlements
- audited upgrade, downgrade, cancellation, suspension, and temporary override
  workflows
- Admin client registry and site-level plan management
- durable PostgreSQL automation schedules, jobs, attempts, leases, heartbeats,
  retries, cancellation, interruption recovery, and per-site operation locks
- proactive five-minute entitlement lifecycle synchronization
- recipient-level transactional email with encrypted global/provider settings
- Brevo REST delivery, authenticated delivery webhooks, bounce suppression, and
  inspectable outbox history
- Admin automation controls and per-site recipient/category management
- durable WordPress connections with automatic dual-key HMAC rotation,
  overlap, replay resistance, revocation, and explicit reconnect
- detailed WordPress core/plugin/theme inventory and update activity history
- manual and six-hour WordPress observation refresh
- Hostinger portfolio/domain synchronization with explicit capability gaps
- Cloudflare-owned SiteCare Pro uptime incident state and Security Status
- monthly portable SiteCare Pro long-term backups and supervised restore plans
- automated/manual SiteHealth Checkups and published SiteHealth Reviews
- Admin-only, MFA-gated, canary-first centralized plugin rollouts
- complete client-safe portal with reports and per-site email recipients
- structured operational logging, System Health, and recovery runbooks

The original Version One plan is complete, and its controlled action layer was
not implemented.

The approved 2026 roadmap now moves the platform toward:

- PostgreSQL
- application-owned email/password authentication
- Admin, Team Member, and Client access
- durable scheduling that consumes SiteCare activation intents
- durable scheduling and Brevo transactional email
- detailed WordPress update intelligence
- Cloudflare uptime and security status
- SiteHealth Checkups and SiteHealth Reviews
- SiteCare Pro long-term backups
- controlled centralized manual plugin updates

The active phased roadmap is:

```text
instructions/AP_SITECARE_IMPLEMENTATION_PLAN.md
```

Roadmap Phases 1–10 are implemented and Phase 11 hardening is
implementation-complete. Phase 7 adds monthly SiteCare Pro portable
full-site backups, Hostinger SSH/SFTP acquisition, Dropbox offline OAuth,
24-month retention tracking, backup email notifications, and supervised restore
evidence. Production acceptance still requires a live Hostinger source test,
Dropbox OAuth refresh/reconnect proof, and one supervised restore rehearsal.

Backup destination setup is documented in
[`docs/BACKUP_DESTINATIONS.md`](docs/BACKUP_DESTINATIONS.md), and worker operation
and production acceptance are documented in
[`BACKUP_WORKER_OPERATIONS.md`](BACKUP_WORKER_OPERATIONS.md).

The original completed plan is preserved at:

```text
instructions/AP_SITECARE_IMPLEMENTATION_PLAN_LEGACY.md
```

## Local Development

```bash
cp .env.example .env
npm install
docker compose up -d postgres
npm run dev
```

The host-run dashboard uses `NUXT_DATABASE_URL`; Compose containers use
`COMPOSE_DATABASE_URL`. Keep both credentials aligned with `POSTGRES_PASSWORD`.

### Dependency security policy

Nuxt is intentionally pinned in both the workspace root and dashboard package.
The root declaration makes npm apply the security override for
`brace-expansion` to the shared workspace dependency tree. Linux native build
bindings are explicit optional dashboard dependencies so a lockfile generated
on macOS remains reproducible in the Node 22 Docker image. Preserve both choices
until the upstream Nuxt archive chain and npm cross-platform optional-dependency
handling no longer require them.

There is no authentication bypass or public registration. Create the first
administrator once with:

```bash
SITECARE_BOOTSTRAP_EMAIL=owner@example.com \
SITECARE_BOOTSTRAP_NAME="SiteCare Owner" \
SITECARE_BOOTSTRAP_PASSWORD="use-a-long-unique-password" \
npm run bootstrap-admin --workspace=@ap-sitecare/dashboard
```

Configure `NUXT_AUTH_EVENT_HASH_KEY`, the application URL, secure cookies,
`NUXT_CREDENTIAL_ENCRYPTION_KEY`, and the Brevo API settings before production
deployment. See
[`docs/AUTHENTICATION_AND_ACCESS.md`](docs/AUTHENTICATION_AND_ACCESS.md).
The general automation and email-worker contracts are documented in
[`docs/AUTOMATION_AND_NOTIFICATIONS.md`](docs/AUTOMATION_AND_NOTIFICATIONS.md).
WordPress connection, update intelligence, Hostinger visibility, and connector
deployment are documented in
[`docs/WORDPRESS_UPDATE_INTELLIGENCE.md`](docs/WORDPRESS_UPDATE_INTELLIGENCE.md).
Central package rollout is documented in
[`docs/CENTRAL_PLUGIN_UPDATES.md`](docs/CENTRAL_PLUGIN_UPDATES.md), the client
projection in [`docs/CLIENT_PORTAL.md`](docs/CLIENT_PORTAL.md), and production
recovery/acceptance in
[`docs/PRODUCTION_OPERATIONS_AND_RECOVERY.md`](docs/PRODUCTION_OPERATIONS_AND_RECOVERY.md).

Before issuing site credentials, set and securely back up:

```text
NUXT_CREDENTIAL_ENCRYPTION_KEY
```

Optional read-only provider settings are documented in `.env.example`.

## WordPress Reporter

Install the plugin from:

```text
plugins/ap-sitecare
```

In WordPress, open **Settings → AP SiteCare**, enter the dashboard URL, Site
ID, and Site Secret, then test the connection and send the first check-in.
Install AP SiteCare 0.5.0 / contract 4 before using centralized plugin updates.

## MCP

Run the local stdio MCP server against the configured database:

```bash
npm run mcp
```

The MCP server can inspect SiteCare state and create Action Requests. It cannot
approve or execute actions.

## Verification

```bash
docker compose -f compose.test.yaml up -d --wait
npm run typecheck
npm test
npm run build
docker compose config --quiet
docker compose build
npm audit
```

Tests create and remove a unique PostgreSQL schema for each case. Override
`TEST_DATABASE_URL` when CI provides its own PostgreSQL service.

For a legacy SQLite deployment, follow
[`docs/POSTGRESQL_MIGRATION.md`](docs/POSTGRESQL_MIGRATION.md) before starting
the new application version.

## Background workers

Run the general scheduler/automation worker once or continuously:

```bash
npm run automation-worker
npm run automation-worker:continuous
```

Run the transactional email worker once or continuously:

```bash
npm run email-worker
npm run email-worker:continuous
```

These are separate deployment processes. The automation worker owns general
scheduled application work; the existing backup worker remains specialized for
archive and database-dump execution. Web requests only commit jobs and outbox
messages; they do not perform long-running work or send email directly.

## Production status

Local implementation completion is not live acceptance. Before the expanded
release is declared operational, complete the Dropbox restart proof, Hostinger
source acquisition, supervised restore, connector-4 canary update, Brevo/report
delivery, Cloudflare Free-plan capability check, and multi-role browser checks
listed in the production operations runbook. The Admin **System Health** page
shows configuration presence and degraded workers/integrations without exposing
secret values.
