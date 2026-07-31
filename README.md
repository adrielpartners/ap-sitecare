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
- renewable, revocable 30-day sessions
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

Roadmap Phases 1–7 are implemented. Phase 7 adds monthly SiteCare Pro portable
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
WordPress connection, update intelligence, Hostinger visibility, and plugin
0.3.0 deployment are documented in
[`docs/WORDPRESS_UPDATE_INTELLIGENCE.md`](docs/WORDPRESS_UPDATE_INTELLIGENCE.md).

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
