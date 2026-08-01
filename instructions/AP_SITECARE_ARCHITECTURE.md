# AP_SITECARE_ARCHITECTURE.md

Version: 2.4
Project: AP SiteCare
Repository: `ap-sitecare`
System Type: Internal and Client Operations Platform + WordPress Site Connector
Last Updated: 2026-07-31

---

# Purpose

AP SiteCare is an operations platform used by Adriel Partners to monitor,
manage, report on, and perform approved maintenance activities across multiple
WordPress websites. It also provides a role-limited Dashboard for clients.

The system provides a centralized view of site health, update status, uptime, backup status, security posture, and operational metadata.

The dashboard is the primary product.

The WordPress plugin is a durable site connector that collects approved
site-specific information, securely reports it to the Dashboard, and performs
only explicitly authorized, narrowly scoped operations.

The dashboard owns operational awareness.

The plugin owns local data collection.

## Current Baseline and Approved Target

The current codebase uses PostgreSQL and application-owned email/password
authentication. It has durable users, client accounts, memberships, site
access, sessions, invitations, password resets, authentication events, MFA
foundation records, a provider-neutral authentication email outbox, immutable
SiteCare plans, centralized entitlements, plan lifecycle records,
administrative overrides, service-activation intents, general automation and
email workers, WordPress/Hostinger visibility, Cloudflare-backed uptime
incidents, Cloudflare Security Status evidence, and Dashboard-owned SiteHealth
Checkup and versioned SiteHealth Review models.

The approved roadmap changes the target architecture to:

- PostgreSQL
- application-owned email/password authentication
- Admin, Team Member, and Client roles
- client accounts with site ownership and strict resource scoping
- a central SiteCare plan and entitlement service
- durable workers, scheduler, idempotency, per-site locks, and transactional
  outbox
- Dashboard-generated reports and email
- Cloudflare-provided uptime probes and security evidence
- Hostinger-owned routine backups and restoration
- SiteCare-owned long-term SiteCare Pro backups

PostgreSQL, application authentication, client ownership, central
entitlements, durable automation/email, WordPress/Hostinger visibility,
Cloudflare uptime/security evidence, SiteCare Pro backup execution, and
SiteHealth Checkups/Reviews are implemented. The remaining items are approved
targets, not claims about current implementation. The active sequence is
defined in `AP_SITECARE_IMPLEMENTATION_PLAN.md`.

---

# 1. Project Identity

## Project Name

AP SiteCare

## One-Sentence Summary

AP SiteCare is an internal monitoring and operations platform that provides a centralized health dashboard for managed WordPress websites.

## Primary Audience

- Adriel Partners
- Internal operations staff
- Future team members
- SiteCare clients with limited access to their own accounts and sites
- Authorized AI agents operating under Adriel Partners policies

## Core Problem

Managing many WordPress websites requires visibility into updates, uptime, backups, security, and maintenance needs across multiple systems.

## Core Value

The system allows an operator to answer:

> "Are all managed sites healthy and protected?"

from a single dashboard.

---

# 2. System Type

## Classification

Hybrid Internal Operations Platform

### Dashboard Application

Responsibilities:

- site inventory
- health monitoring
- operational visibility
- reporting
- future automation orchestration
- API layer
- future MCP layer

### WordPress Reporter Plugin

Responsibilities:

- collect WordPress health data
- report data securely
- perform lightweight diagnostics
- provide a limited client-facing care summary inside WordPress Admin
- cache signed, read-only care summaries from the dashboard
- provide future action endpoints

The plugin is not the product.

The dashboard is the product.

The plugin's client-facing view is a reassurance and visibility layer. It does
not own operational history, calculate portfolio health, or duplicate the
internal operations dashboard.

---

# 3. Product Scope

## Historical Version One Goals

- Register managed websites
- Generate site credentials and tokens
- Accept secure health check-ins
- Display overall site health
- Display WordPress version
- Display plugin/theme update counts
- Display PHP version
- Display last successful check-in
- Display backup strategy information
- Provide a clean operational dashboard
- Support multiple dashboard users through Google authentication
- Expose a documented internal API

## Historical Version One Non-Goals

The completed legacy Version One did not:

- perform remote updates
- perform remote restores
- manage Cloudflare settings
- manage Hostinger settings
- execute AI-driven maintenance
- expose MCP execution tools

Several historical non-goals are superseded by the active roadmap. In
particular, client Dashboard access, SiteCare Pro long-term backup automation,
and controlled centralized plugin updates are now approved for later phases.

---

# 4. Core Technology Stack

## Frontend

- Nuxt 3
- Vue 3
- TypeScript

## Backend

- Nuxt Server Routes
- Nitro

## Infrastructure

- VPS Hosted
- Docker preferred
- Nginx reverse proxy

## Authentication

- application-owned email/password accounts
- revocable 30-day renewable sessions
- Admin, Team Member, and Client roles
- optional site restrictions for Team Members
- client-account and site-level authorization
- durable invitation and password recovery emails through Brevo
- optional MFA foundation, with Admin MFA required before later high-risk
  update or restore execution

Plugin:

- Site ID
- Site Secret
- HMAC request signing

## Database

Current:

- PostgreSQL

## External Integrations

Planned:

- Hostinger API
- Hostinger MCP
- Cloudflare API
- Dropbox API

---

# 5. Hosting and Portability

Primary deployment:

`sitecare.adrielpartners.com`

Hosted on an Adriel Partners VPS and proxied and protected by Cloudflare.

Cloudflare protects the public edge but does not authenticate Dashboard users
or supply trusted human identity headers.

---

# 6. Domain Model

- Managed Site
- Client Account
- User
- Membership
- Session
- Service Plan
- Site Subscription / Entitlement
- Administrative Override
- Site Credential
- Site Check-In
- Site Health Snapshot
- Action Request
- Audit Event
- Scheduled Job
- Notification / Outbox Delivery
- Uptime Incident
- Cloudflare Security Control Result
- Update Inventory and Update Activity
- SiteHealth Checkup
- SiteHealth Review
- Backup Artifact and Restore Plan

---

# 7. System Layers

Dashboard:

UI → Server Route → Service Layer → Repository Layer → Database

Plugin Reporting:

WordPress Cron / Manual Trigger → Reporter Service → Signed API Request → Dashboard API → Check-In Service → Repository Layer → Database

Plugin Client Visibility:

WordPress Admin Hook → Client Admin Controller → Client Care Service → Local
WordPress Collection + Client Summary Repository → Scoped Admin View

The client summary repository stores the latest signed, read-only dashboard
projection in WordPress options. Admin page rendering never makes a live
dashboard request.

Future Actions:

Dashboard User / AI Agent → Action Request → Approval Layer → Execution Service → External API → Audit Log

---

# 8. Folder Structure

```text
ap-sitecare/

apps/
  dashboard/

plugins/
  ap-sitecare/

packages/
  shared/

docs/
```

---

# 9. Authentication and Authorization

## Dashboard Authentication

- application-owned email/password authentication
- salted scrypt password hashes
- opaque server-side sessions in Secure, HttpOnly, SameSite cookies
- double-submit CSRF tokens bound to the stored session
- Admin, Team Member, and Client authorization
- repository-level client and site scoping
- no public registration and one-time first-Admin bootstrap

Clients may read only their own sites and approved client-safe records. They
must never receive provider credentials, internal notes, master settings,
internal audit details, or another client's data.

## Plugin Authentication

Headers:

```text
X-APSC-Site-ID
X-APSC-Timestamp
X-APSC-Signature
```

---

# 10. API Strategy

AP SiteCare is API-first.

Example endpoints:

```text
GET    /api/sites
GET    /api/sites/:id
GET    /api/sites/:id/health
GET    /api/sites/:id/checkins

POST   /api/sites
POST   /api/site-checkin
POST   /api/test-connection
POST   /api/plugin/client-summary
```

`/api/plugin/client-summary` uses the existing plugin HMAC boundary and returns
only client-safe, read-only care data. Unavailable backup, security, uptime,
and service-time metrics remain explicitly unknown.

---

# 11. Agent and MCP Readiness

The platform should be agent-ready from Version One.

Future MCP tools may include:

- list_sites
- get_site_health
- get_site_updates
- get_backup_status
- create_action_request
- approve_action_request

The MCP layer should consume AP SiteCare services and never bypass the application.

---

# 12. Visual Identity

The dashboard should feel:

- calm
- beautiful
- trustworthy
- operational

Target feeling:

> A well-designed aircraft cockpit, not a social media dashboard.

Beauty is a functional requirement.

---

# 13. Phase One Dashboard Foundation

## Workspace

The repository uses npm workspaces.

The dashboard package is:

```text
apps/dashboard
```

## Dashboard Runtime

The dashboard is a Nuxt 3 application using:

- Vue 3
- TypeScript with strict mode
- Nitro's Node server preset

## PostgreSQL Foundation

The dashboard, backup worker, and MCP server share PostgreSQL through the
server-only `pg` connection utility.

The database layer:

- uses a bounded connection pool with process-specific application names;
- applies ordered migrations transactionally under an advisory lock;
- uses PostgreSQL booleans, JSONB, timestamps with time zone, and BIGINT where
  appropriate;
- exposes explicit transaction boundaries to repositories and services;
- uses row locking with `FOR UPDATE SKIP LOCKED` for competing backup workers.

`better-sqlite3` remains only for the one-time legacy import and its focused
test. It is not used by the application runtime.

## Application Authentication Boundary

The Dashboard authenticates humans with application-owned email/password
accounts. Cloudflare identity headers are ignored. Random, meaningless session
tokens are stored only as SHA-256 hashes, expire after 30 days, renew while
active, and can be revoked per browser or per account. Unsafe API requests
also require a CSRF token that matches the session record.

Cloudflare continues proxying and protecting the domain without requiring a
second human login. Direct origin access remains restricted at the
infrastructure layer.

The health endpoint is intentionally unauthenticated:

```text
GET /api/health
```

It exists for local and container health verification and returns no sensitive
operational data.

## Environment Variables

```text
NUXT_DATABASE_URL
NUXT_SITECARE_BASE_URL
NUXT_AUTH_SECURE_COOKIES
NUXT_AUTH_EVENT_HASH_KEY
NUXT_AUTH_SESSION_DAYS
NUXT_EMAIL_PROVIDER
NUXT_EMAIL_BREVO_API_KEY
NUXT_EMAIL_FROM_ADDRESS
NUXT_EMAIL_FROM_NAME
NUXT_EMAIL_REPLY_TO
NUXT_CREDENTIAL_ENCRYPTION_KEY
NUXT_INTEGRATIONS_PAGESPEED_API_KEY
NUXT_INTEGRATIONS_PAGESPEED_API_BASE_URL
```

No local or production authentication-bypass variable is supported.

## Deployment Foundation

The repository contains:

- a multi-stage Dockerfile
- a Docker Compose service
- a tracked production VPS Compose definition at `deploy/vps.compose.yaml`
- a private PostgreSQL service with a durable data volume
- a container health check using `/api/health`

---

# 14. Phase Two Design System Foundation

## Style Architecture

The dashboard visual system follows:

```text
Design Tokens
→ UI Primitives
→ Feature Components
→ Pages
```

Global styles live in:

```text
apps/dashboard/assets/styles/
  tokens.css
  base.css
  utilities.css
```

## Design Tokens

The initial light theme defines:

- semantic colors and status colors
- typography scale and weights
- spacing scale
- radius scale
- borders
- restrained shadows
- motion timing
- z-index layers
- layout dimensions

Tokens use semantic names so a future dark theme can be introduced without
rewriting components.

## UI Primitives

Reusable visual primitives live in:

```text
apps/dashboard/components/ui/
```

Phase Two includes:

- `AppButton`
- `AppCard`
- `AppInput`
- `AppBadge`
- `AppTable`
- `AppPanel`
- `AppEmptyState`

## Layout Shell

The responsive dashboard shell lives in:

```text
apps/dashboard/layouts/default.vue
apps/dashboard/components/layout/
```

The shell includes:

- a sticky top header
- desktop side navigation
- compact mobile navigation
- a responsive content area

Phase Two's overview page is a design-system approval surface. It uses sample
content only and does not represent a Phase Three data implementation.

---

# 15. Phase Three Core Data Model

## Migration System

PostgreSQL schema changes are applied through ordered migrations in:

```text
apps/dashboard/server/database/migrations.ts
```

Applied migrations are recorded in:

```text
schema_migrations
```

Migrations run when the database connection is initialized. Each migration is
transactional and is applied only once. Concurrent process startup is
serialized with a PostgreSQL advisory transaction lock.

Legacy SQLite data is imported through:

```text
apps/dashboard/scripts/migrate-sqlite-to-postgres.ts
```

The importer creates a rollback copy, converts JSON and boolean values,
imports inside one transaction, and verifies row counts and primary keys.

## Data Ownership

AP SiteCare owns the following operational tables:

### `sites`

Stores the managed-site inventory.

Important fields:

- `id`
- `name`
- `url`
- `status`
- `created_at`
- `updated_at`
- `disabled_at`

Sites are disabled rather than deleted through the service layer.

### `site_credentials`

Stores dashboard-owned credentials used for future plugin HMAC authentication.

Important fields:

- `id`
- `site_id`
- `secret_ciphertext`
- `secret_hint`
- `created_at`
- `revoked_at`

Only one active credential may exist per site.

Secrets are encrypted at rest with AES-256-GCM using:

```text
NUXT_CREDENTIAL_ENCRYPTION_KEY
```

The raw secret is returned only when initially issued. It is never stored
plaintext and must never be logged.

---

# 16. Phase Four Site Registration

## Registration Flow

Managed sites are registered through the dashboard:

```text
Site Registration Page
→ Sites API Route
→ Site Service
→ Site Repository
→ PostgreSQL
```

The site list and detail pages consume the same API used by future agents.

## Site Lifecycle API

Protected dashboard endpoints:

```text
GET    /api/sites
POST   /api/sites
GET    /api/sites/:id
PATCH  /api/sites/:id
POST   /api/sites/:id/disable
POST   /api/sites/:id/credentials
GET    /api/sites/:id/connection
```

Site reads never return encrypted credential material or raw secrets.

## Connection Readiness

The dashboard reports one of three registration connection states:

- `credentials-required`
- `awaiting-check-in`
- `connected`

Connection status is derived from active credential and check-in state. It
does not create a shortcut around the WordPress reporting workflow.

---

# 17. Phase Five WordPress Reporter

## Plugin Structure

The reporting agent lives in:

```text
plugins/ap-sitecare/
```

Its request flow is:

```text
WordPress Hook
→ Controller
→ Reporter Service
→ API Client Service
→ Dashboard Plugin API
→ Plugin Reporting Service
→ Health Service
→ Repositories
→ PostgreSQL
```

The plugin stores only its connection settings and last cron-run timestamp in
WordPress options. AP SiteCare owns check-in and operational history.

## Signed Request Contract

Public plugin endpoints:

```text
POST /api/plugin/test-connection
POST /api/plugin/check-in
```

Each request requires:

```text
X-APSC-Site-ID
X-APSC-Timestamp
X-APSC-Signature
```

The signature is a lowercase hexadecimal HMAC-SHA256 of:

```text
timestamp + "." + exact_request_body
```

Requests older or newer than five minutes are rejected. Disabled sites,
missing active credentials, and invalid signatures are rejected.

## Reported WordPress Data

- WordPress version
- PHP version
- Plugin update count
- Theme update count
- Last WP-Cron reporter run

Plugin contract version 3 additionally reports bounded, privacy-minimized
SiteHealth evidence for published pages, media candidates, user roles and
registration dates, the WordPress/PHP/storage environment, and WordPress-owned
database metrics. It does not report user email addresses, authentication
data, content bodies, private media, or claimed user last-activity data.

---

# 18. Phases Six Through Eight Operational Dashboard

## Health Projection

`HealthService` owns normalized operational status. The UI receives health
summaries and does not calculate operational state.

Status rules:

- `unknown`: no check-in has been received
- `healthy`: recent check-in and no available updates
- `attention`: recent check-in with one to nine available updates
- `critical`: ten or more available updates, or the latest check-in is more
  than 24 hours old

Health APIs:

```text
GET /api/site-health
GET /api/sites/:id/health
GET /api/sites/:id/check-ins
```

## Audit History

Audit reads flow through `AuditService` and `AuditRepository`.

```text
GET /api/audit
GET /api/sites/:id/audit
```

## Operational Site Context

The managed-site inventory also owns:

- hosting provider
- backup strategy
- risk level
- operational notes

These fields are operator-maintained context. External providers remain the
source of truth for their own operational data.

---

# 19. Phase Nine External Integrations

External provider clients live in:

```text
apps/dashboard/server/integrations/
```

They are coordinated by `IntegrationService`. All current integration calls
are read-only.

Implemented visibility:

- Cloudflare DNS resolution through its unauthenticated DNS-over-HTTPS API,
  with richer zone status through the Zones API when a token is configured
- Dropbox backup-location existence through `files/get_metadata`
- Hostinger API connectivity through a configured Hostinger API base URL

Provider credentials are supplied only through runtime environment variables.
Provider checks return explicit `not-configured` states when required settings
are absent.

Official references:

- https://developers.cloudflare.com/api/resources/zones/methods/list/
- https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/
- https://www.dropbox.com/developers/documentation/http/documentation#files-get_metadata
- https://developers.hostinger.com/

---

# 20. Phase Ten Agent Readiness

## Action Requests

Action Requests represent proposals only:

```text
Agent / Dashboard User
→ Action Request API
→ Action Request Service
→ Action Request Repository
→ PostgreSQL
→ Audit Event
```

Action Request states:

- `pending`
- `approved`
- `rejected`

Approval does not execute an action.

## Agent Inspection APIs

```text
GET /api/agent/sites
GET /api/agent/sites/:id/history
GET /api/agent/sites/:id/updates
```

---

# 21. Phase Eleven MCP Layer

The MCP stdio server lives in:

```text
apps/dashboard/mcp/
```

Run it with:

```text
npm run mcp
```

MCP tools:

- `list_sites`
- `get_site_health`
- `get_backup_status`
- `get_site_notes`
- `create_action_request`

The MCP tool service composes existing application services with repositories
bound to the configured PostgreSQL database. It does not access database tables
directly and exposes no execution capability.

The stdio transport uses newline-delimited UTF-8 JSON-RPC and negotiates the
current MCP protocol version `2025-11-25`, with compatibility for
`2025-03-26`.

Official MCP references:

- https://modelcontextprotocol.io/specification/latest/basic/lifecycle
- https://modelcontextprotocol.io/specification/latest/basic/transports
- https://modelcontextprotocol.io/specification/latest/server/tools

### `site_check_ins`

Stores received plugin check-in envelopes and limited raw metadata.

Important fields:

- `id`
- `site_id`
- `received_at`
- `source`
- `request_timestamp`
- `payload_json`

### `site_health_snapshots`

Stores normalized operational health data associated with a check-in.

Important fields:

- `id`
- `site_id`
- `check_in_id`
- `status`
- `wordpress_version`
- `php_version`
- `plugin_update_count`
- `theme_update_count`
- `last_cron_run_at`
- `created_at`

### `audit_events`

Stores durable operational events.

Important fields:

- `id`
- `site_id`
- `actor_type`
- `actor_identifier`
- `event_type`
- `metadata_json`
- `created_at`

Audit events survive site deletion by setting `site_id` to null, although the
current service layer does not expose site deletion.

## Data Layer Placement

```text
server/database/       migrations
server/domain/         shared domain contracts
server/repositories/   persistence
server/services/       business behavior
```

Required Phase Three repositories:

- `SiteRepository`
- `CheckInRepository`
- `AuditRepository`

Required Phase Three services:

- `SiteService`
- `HealthService`
- `CredentialService`

An internal protected endpoint exposes migration and table readiness:

```text
GET /api/data-foundation
```

## Retention and Recovery

Version One retains check-ins, snapshots, credentials, and audit events
indefinitely.

Production backup policy must include independent PostgreSQL logical or
physical backups with tested restoration. The PostgreSQL volume alone is not a
backup. The legacy SQLite source and rollback copy remain preserved through the
cutover validation window.

---

# 22. Premium Operations Overview

## Dashboard Composition

The main operations overview consumes:

```text
Dashboard Page
→ GET /api/dashboard-overview
→ DashboardService
→ SiteService + HealthService + AuditService + ScheduledTaskService
→ Repositories
→ PostgreSQL
```

`DashboardService` owns:

- portfolio health aggregates
- health distribution percentages
- paginated managed-site overview rows
- recent activity projection
- computed scheduled-task placeholders

The page does not calculate operational health.

## Version One Health Signals

Real Version One health uses:

- latest check-in age
- reported plugin update count
- reported theme update count

Rules:

- `unknown`: no check-in exists
- `healthy`: a check-in is no more than 24 hours old and reports no updates
- `attention`: updates are pending or the latest check-in is 24–72 hours old
- `critical`: the latest check-in is more than 72 hours old

Uptime, security, and SSL now consume Cloudflare incident, TLS-alert, and
security-evidence state. Backup freshness remains `unknown` until its owning
provider supplies reliable evidence.

## Scheduled Tasks

`ScheduledTaskService` computes planning placeholders for:

- daily check-in review
- weekly security scan
- monthly operations report
- monthly offsite archive

These records do not execute jobs and do not claim that work occurred.

## Navigation

The shell exposes safe routes for Dashboard, Clients, Sites, Reports, Security,
Updates, Backups, Alerts, and Settings. Sections without implemented domain
behavior render explicit coming-soon pages.

---

# 23. SiteCare Pro Long-Term Backup and Supervised Restore

SiteCare owns only SiteCare Pro long-term backups. Hostinger owns routine daily
backups and its restoration flow. The Dashboard owns policy, entitlements,
scheduling, storage, evidence, notifications, retention, and supervised
restore records; the specialized backup worker performs heavy acquisition,
packaging, verification, and upload.

## Policy and Lifecycle

- the immutable Pro default is one full files-and-database backup each month
- retention is 24 months from artifact creation
- one effective independent destination is executable per site
- a daily general-automation evaluation queues a due monthly backup and uses a
  `(site_id, schedule_period)` database constraint for deduplication
- the worker reevaluates `long-term-backups` immediately before execution
- downgrade, cancellation, suspension, and site disablement stop new work
  through central entitlement state but never shorten existing artifact expiry
- manual backup remains available to entitled Pro sites

Policy/connection saves, artifact/job/destination creation, job claims, and
completion/failure finalization are transactional. Jobs use PostgreSQL row
locking, leases, heartbeats, stale recovery, and new-artifact retries.

## Source Boundary

The production shared-hosting source is Hostinger SSH/SFTP with a durable SSH
private key encrypted by `NUXT_CREDENTIAL_ENCRYPTION_KEY`. Per-site records
contain host, port, username, remote WordPress root, credential version,
learned/pinned host key, test state, and secret-safe failure evidence.

Connection testing requires readable `wp-config.php` and WP-CLI. Execution:

1. downloads the readable WordPress tree recursively with fixed OpenSSH SFTP
2. rejects unsafe paths and symlinks
3. exports SQL with the fixed remote command `wp db export - --quiet`
4. never accepts user-supplied commands

Legacy Local VPS connections are set to `quarantined` by migration 12 and work
only when an explicit read-only worker mount satisfies the existing allowlist.
Plugin-reported direct database credentials remain an encrypted transitional
database-only source. Once a tested SSH/SFTP source is `ready`, plugin check-ins
do not replace it or ingest a new database password.

## Portable Package and Evidence

Every package uses ordinary WordPress-compatible artifacts:

- `hostname_UTC-timestamp_backup-id_wordpress-files.tar.gz`
- `hostname_UTC-timestamp_backup-id_wordpress-database.sql.gz`
- `hostname_UTC-timestamp_backup-id_manifest.json`
- `hostname_UTC-timestamp_backup-id_checksum.sha256`
- `hostname_UTC-timestamp_backup-id_RESTORE.md`

Tar readability, gzip integrity, and every SHA-256 entry are checked locally
before upload. Each remote object stores destination ID, exact path, archive
name, size, checksum, upload state, and verification timestamp. Partial upload
evidence and failed artifacts are retained.

## Dropbox Destination

Dropbox is the first executable adapter. New Dashboard-managed connections use
OAuth authorization-code flow with `token_access_type=offline`; the encrypted
refresh token automatically renews short-lived access. The original runtime
access-token configuration remains compatible during cutover.

The configurable default root is `/SiteCare Backups`. A client folder is
created once from the client name and does not change when the display name
changes. New artifact directories are:

```text
/SiteCare Backups/Client Name/YYYY/MM/{backup-id}
```

Changing a root affects only new artifacts because existing objects retain
their exact path. Google Drive and S3-compatible records remain explicitly
non-executable future adapters.

## Status, Notification, Retention, and Restore

Site Detail shows Hostinger daily-backup evidence separately from SiteCare's
latest successful long-term backup and recent failures. Success and failure
messages are generated by the Dashboard and fan out through the backup
notification category to multiple site recipients.

The daily retention workflow creates an audited dry-run and marks due artifacts
`expiration-due`. It does not delete remote objects until a separate production
approval enables deletion.

A supervised restore plan checks completed state, local checksum verification,
remote upload verification, files, SQL, and restoration README. Authorized
technicians can create four-hour Dropbox download links and record checklist,
target host, notes, start/completion timestamps, operator, and outcome. No
unattended restore execution exists. Hostinger restoration remains an external
management link.

## Data and APIs

Migration 12 extends the earlier backup tables and adds:

- `backup_client_folders`
- `backup_artifact_objects`
- `backup_retention_runs`
- `backup_destination_oauth_states`

Protected Phase 7 routes add:

```text
POST /api/backup-destinations/:id/oauth/start
GET  /api/backup-destinations/oauth/callback
GET  /api/backups/:id/download-links
PUT  /api/sites/:id/restore-plans/:planId
```

The existing backup, destination, manual queue, verification, retry, connection
test, and restore-preflight routes remain. See `docs/BACKUP_DESTINATIONS.md` and
`BACKUP_WORKER_OPERATIONS.md` for deployment and acceptance procedures.

---

# 24. Client Registry, Plans, and Entitlements

## Ownership Boundary

Every site has one row in `site_client_accounts` and one row in
`site_service_subscriptions`. New site registration creates the site, assigns
a non-placeholder client, assigns its initial plan, records the initial
transition, creates any activation intents, and writes audit history in one
PostgreSQL transaction.

Migration 8 safely places any previously ownerless site under the fixed
`Unassigned Sites — Review Required` placeholder and assigns existing sites to
SiteCare Core. The placeholder is a visible migration exception, not a valid
client choice for new registrations.

## Plan Model

The three definitions live in
`server/services/service-plan-definitions.ts` and are runtime-frozen. The
database stores only each site's plan identity and lifecycle facts; it does
not copy a mutable capability matrix into every subscription.

`EntitlementService` composes:

- site and client status
- the underlying plan definition
- subscription and paid-through state
- a pending lifecycle transition
- active administrative overrides
- evaluation time

The result contains an explicit operational status, effective capabilities,
effective settings, lifecycle dates, and the unchanged underlying plan.
Services and workers must call `assertCapability` before new plan-gated work.

## Lifecycle and Temporal State

Upgrades apply immediately. Downgrades and cancellation remain scheduled until
the paid-period-end effective date. Client suspension and reactivation apply
across all owned sites without deleting history. Only one scheduled plan
transition is allowed per site.

Due transitions and expired overrides are synchronized transactionally by the
central service during evaluation. The Phase 4 scheduler invokes that same
service every five minutes per subscribed site, preserving deterministic
request-time behavior without duplicating lifecycle rules in a worker.

Newly eligible operational capabilities produce rows in
`site_service_activation_intents`. Those rows mean work is eligible to be
scheduled; they do not mean a backup, uptime check, update check, or Checkup
has completed.

## Schema

- `client_accounts.is_placeholder`
- `site_service_subscriptions`
- `site_plan_transitions`
- `site_entitlement_overrides`
- `site_service_activation_intents`

Transition and override events also produce immutable `audit_events` entries.
Retained backup artifacts and restore evidence remain readable after service
loss until their own expiration dates.

## Administrative APIs

```text
GET   /api/admin/clients
POST  /api/admin/clients
GET   /api/admin/clients/:id
PATCH /api/admin/clients/:id
PUT   /api/admin/clients/:id/sites
POST  /api/admin/clients/:id/status

GET   /api/admin/service-plans
GET   /api/admin/sites/:id/service
POST  /api/admin/sites/:id/service/preview
POST  /api/admin/sites/:id/service/transitions
POST  /api/admin/sites/:id/service/overrides
PATCH /api/admin/sites/:id/service/overrides/:overrideId
DELETE /api/admin/sites/:id/service/overrides/:overrideId
```

These routes require Admin-level identity management permission. The preview
route must be used before the interface confirms a plan lifecycle change.
Routes validate input and delegate all business behavior to services.

See `docs/CLIENTS_PLANS_AND_ENTITLEMENTS.md` for the operational contract and
Phase 4 handoff.

---

# 25. Durable Automation and Transactional Notifications

## Worker Topology

Long-running work is no longer tied to a Dashboard request. The deployed
topology contains:

- the Nuxt Dashboard/API process
- the general `automation-worker`
- the transactional `email-worker`
- the existing specialized `backup-worker`

The general worker does not replace the verified backup execution pipeline.
It provides a common orchestration path for later WordPress, Hostinger,
Cloudflare, SiteHealth, and notification-triggering workflows.

## Durable Workflow Data

`automation_schedules` records recurring definitions and their next due time.
`automation_jobs` records the requested actor, safe payload/result, workflow
state, idempotency key, attempt allowance, cancellation state, and active
lease. `automation_job_attempts` records every worker claim independently.
`automation_operation_locks` serializes the same operation within a site or
system scope.

Claims and due-schedule reads use PostgreSQL `FOR UPDATE SKIP LOCKED`. Active
work heartbeats its job and operation-lock leases. Stale recovery records an
interrupted attempt and either requeues with the remaining attempt allowance
or ends in `needs-attention`.

The normalized workflow is:

```text
queued -> preflight -> running -> verifying -> succeeded
                                         \-> failed
                                         \-> needs-attention
                                         \-> cancelled
```

Transient exceptions requeue with bounded exponential backoff. Missing
handlers and technician-review conditions become `needs-attention`. Active
cancellation is cooperative. Job input and output reject credential-like
fields and are size-bounded.

The first registered handler is `entitlements.synchronize`. The scheduler
creates a five-minute schedule for every site subscription and calls the same
`EntitlementService` used by routes and plan-gated services. It does not copy
lifecycle rules into the worker.

## Transactional Notification Data

`email_outbox` stores one durable delivery row per recipient. Phase 4 extends
it with site/category/provider identity, safe metadata, artifact references,
attempt limits, leases, provider status, and completion timestamps.

Related tables are:

- `email_global_settings`
- `email_provider_configurations`
- `site_notification_recipients`
- `site_notification_subscriptions`
- `email_delivery_events`
- `email_suppressions`

Domain services enqueue outbox rows in the same transaction as the event that
requires notification. The email worker claims committed rows, resolves the
selected provider, and records provider acceptance as `sent`. A provider
webhook may later move the row to `delivered`, `bounced`, or `suppressed`.
Rendered bodies are cleared after acceptance, suppression, or terminal
failure; status, attempts, safe metadata, and artifact references remain.

Brevo is the operational REST adapter. Mailgun, Postmark, and SendGrid have
encrypted configuration foundations but deliberately throw an unavailable
adapter error if selected for delivery. Telegram and SMS expose channel
contracts only and remain visibly non-operational.

Brevo webhooks are public only at the session-middleware boundary. The handler
requires its configured Bearer token, deduplicates provider events, and adds
hard bounces, invalid addresses, blocks, complaints, and unsubscribes to the
suppression list.

## Administrative Surfaces

Admins inspect schedules, jobs, attempts, safe failures, cancellation, and
retry in `/automation`. Global email identity, encrypted provider setup,
adapter readiness, outbox history, delivery events, and suppressions live in
`/settings`. Per-site recipients and categories live in the Site Detail
**Notifications** tab.

The API and operational contract is documented in
`docs/AUTOMATION_AND_NOTIFICATIONS.md`.

---

# 26. WordPress Connection, Update Intelligence, and Hostinger Visibility

## Durable WordPress Connection

Each WordPress site authenticates with a site-scoped HMAC credential. The
Dashboard stores encrypted secrets and exposes a raw secret only when an Admin
initially connects or explicitly reconnects a site. Routine rotation is
automatic: the active credential creates an encrypted pending successor, the
plugin receives that successor in a signed response, and the first request
made with it atomically promotes it to active while the predecessor enters a
14-day overlap window. Expired overlap credentials are rejected.

Every accepted plugin request is bound to the timestamp and exact raw body.
The request signature hash is claimed in PostgreSQL, so an otherwise valid
duplicate is rejected as a replay. `site_plugin_connections` stores safe
protocol/plugin status separately from credential material. Revocation removes
all accepted keys without deleting history.

The Dashboard-to-plugin refresh path uses a separate direction marker in its
signature and a request ID. The WordPress REST endpoint performs an
observation-only check and immediately reports through the normal plugin
check-in path; it does not install software or expose a general remote command
surface.

## Update Evidence

WordPress is authoritative for installed core, plugin, and theme state. Plugin
contract version 2 reports normalized inventory, check time, pending versions,
active and auto-update state, safe support/license signals, and update activity.
Contract version 1 remains accepted for rolling upgrades but cannot populate
detailed inventory.

`wordpress_update_snapshots` stores each accepted observation.
`wordpress_update_inventory_items` stores the component rows for that snapshot.
`wordpress_update_activities` stores attempts independently, including prior
and result versions, source, outcome, timestamps, and normalized errors. A
source event ID makes delivery idempotent. The plugin retains a bounded local
activity queue until the Dashboard acknowledges accepted IDs and reconciles
version changes performed directly in WordPress.

Manual refresh and a six-hour per-site schedule enqueue `wordpress.refresh`
jobs in the Phase 4 automation system. The handler asserts update entitlement,
calls the signed plugin endpoint, and verifies that a fresh snapshot arrived.

## Hostinger Boundary

`hostinger.portfolio.synchronize` runs on a six-hour system schedule and can be
queued manually by an Admin. It reads the official hosting website portfolio
and, when available, WordPress installations. Sites are matched by normalized
domain, so an installation ID is useful evidence but never a prerequisite.

Hostinger website metadata and its hPanel management link are stored in
`hostinger_site_connections`. API warnings and unavailable capabilities remain
visible. The absence of a shared-hosting daily-backup API becomes
`not-available`, not an incident or a failed SiteCare backup. Hostinger routine
backup/restoration and SiteCare Pro long-term backup/restoration remain
separate workflows and interface concepts.

## Interfaces and APIs

- `GET /api/updates` returns the authorized update portfolio.
- `GET /api/sites/:id/updates` returns detailed current state and activity.
- `POST /api/sites/:id/updates/refresh` queues an observation refresh.
- `GET /api/sites/:id/connection` returns safe connection lifecycle state.
- `POST /api/sites/:id/connection/revoke` revokes the durable connection.
- `GET /api/sites/:id/hostinger` returns matched Hostinger capability evidence.
- `POST /api/admin/integrations/hostinger/synchronize` queues portfolio sync.

The operational and plugin-upgrade contract is documented in
`docs/WORDPRESS_UPDATE_INTELLIGENCE.md`.

---

# 27. Cloudflare Uptime and Security Status

## Provider and Application Boundary

Cloudflare performs every website probe. The Dashboard never substitutes its
own HTTP request for provider evidence. A per-site `cloudflare_site_connections`
record maps the canonical homepage to a zone and Health Check while retaining
only safe provider identifiers and capability evidence. The long-lived API
token and webhook secret remain deployment secrets.

The Health Check follows redirects, expects a final `2xx`, validates TLS, and
uses the effective normal interval. Cloudflare changes state after one provider
failure so SiteCare can react immediately. The Dashboard then moves only that
check to 60 seconds. Because Cloudflare sends state-change notifications rather
than one notification per failed probe, a 60-second
`cloudflare.uptime.reconcile` job reads Cloudflare state during the failure.
The second distinct unhealthy observation confirms the incident. This same
read path recovers a missed webhook without probing the site.

## Incident State and Retention

`uptime_monitor_state` holds the short-lived first-failure state and its
provider-event identity. A successful check before confirmation clears it
without creating durable raw history. `uptime_incidents` stores confirmed
start, confirmation, recovery, duration, failure count, reason, technician
notes, restored-backup reference, and notification state.
`uptime_observations` holds confirmed/raw provider history and is deleted after
60 days by a daily retention job; incident summaries remain.

`uptime_maintenance_windows` excludes known work from downtime while retaining
an excluded observation. TLS/certificate reasons use `uptime_tls_alerts`, a
separate email path, and observations explicitly excluded from downtime.

Incident confirmation and each recipient's outbox message commit in one
PostgreSQL transaction. The same is true for recovery and TLS alerts. The
Dashboard email worker remains the only delivery path. Telegram and SMS remain
non-operational notification-channel contracts.

## Security Evidence

The Security Status checklist is read-only against Cloudflare. A synchronization
collects DNS proxy state, zone settings, DNSSEC, Universal SSL, Bot Management,
and relevant Ruleset entrypoints. Each API-derived result is append-only in
`cloudflare_security_evidence` and belongs to a
`cloudflare_security_syncs` capability snapshot.

Plan- or permission-dependent fields use `Unavailable`. Cloudflare transitional
states use `Pending`; stronger-than-Medium Security Level uses `Review` rather
than being treated as broken. Technician evidence is a separate append-only
source with actor, timestamp, and notes. Its latest unsuperseded result wins the
displayed status while API evidence remains intact.

Site Detail exposes dedicated **Uptime** and **Security Status** tabs. Admins
provision Health Checks; Admins and Team Members may synchronize read-only
security evidence, record technician findings, manage maintenance windows, and
complete recovery notes within their authorized site scope. The global
Security page projects portfolio status and links back to each checklist.

The deployment and operations contract is documented in
`docs/CLOUDFLARE_UPTIME_AND_SECURITY.md`.

---

# 28. SiteHealth Checkups and SiteHealth Reviews

## Lifecycle and Entitlement

A SiteHealth Checkup is the evidence-gathering run. A SiteHealth Review is the
versioned Dashboard artifact produced from a completed Checkup. An Admin or
Team Member may queue a manual Checkup for any authorized site regardless of
plan. SiteCare Plus and SiteCare Pro receive one automated annual Checkup;
the first becomes due 30 days after eligibility and each later due date is one
year after the preceding Checkup completes. An annual-cycle uniqueness
constraint and durable job idempotency prevent duplicate runs.

The general automation worker owns `sitehealth.checkup.collect` and the daily
`sitehealth.annual.schedule` evaluation. Collection never runs inside the
Dashboard request. Annual planning and execution both resolve current central
entitlements.

## Evidence Boundary

`SiteHealthEvidenceCollector` composes only attributable evidence:

- Google PageSpeed Insights desktop and mobile performance, lab metrics, and
  field Core Web Vitals when the provider returns them;
- WordPress plugin contract version 3 SiteHealth evidence;
- WordPress core, plugin, theme, and update-activity evidence already stored by
  the Dashboard;
- Hostinger routine-backup evidence when available, otherwise an explicit
  unavailable record;
- SiteCare long-term-backup evidence; and
- an optional bounded, same-origin homepage link check with private-network
  destinations rejected.

Evidence records retain source, observation time, availability, summary, and
the bounded normalized value used to derive the draft. Missing provider or
plugin evidence is never inferred. The Dashboard owns evidence history,
findings, recommendations, Review assembly, delivery, and approval records;
the plugin collects and reports local facts only.

## Review, Delivery, and Cleanup Boundary

Completed collection produces a technician workspace. Staff may amend,
dismiss, or add findings and recommendations while the original evidence
remains immutable. Publishing creates a new immutable Review version and
supersedes the prior published version. The Dashboard emails the Review
through the transactional outbox to every enabled per-site `sitehealth`
recipient.

Client APIs expose only published Review projections. Raw evidence values,
technician identities, and internal technician notes are stripped at this
boundary. Clients are instructed to email Adriel Partners to approve the
recommendations; the application does not interpret replies automatically.
A technician records the external response. Only an `approved-all` record may
create approved cleanup proposals, and a separate technician action may mark a
proposal initiated. Phase 8 contains no cleanup executor and no Service Time
tracking.

Migration 13 adds:

- `sitehealth_checkups`
- `sitehealth_annual_policies`
- `sitehealth_evidence`
- `sitehealth_findings`
- `sitehealth_recommendations`
- `sitehealth_reviews`
- `sitehealth_approvals`
- `sitehealth_cleanup_proposals`

The operational contract is documented in
`docs/SITEHEALTH_CHECKUPS_AND_REVIEWS.md`.
