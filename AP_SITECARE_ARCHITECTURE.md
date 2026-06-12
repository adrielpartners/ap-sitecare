# AP_SITECARE_ARCHITECTURE.md

Version: 1.0
Project: AP SiteCare
Repository: `ap-sitecare`
System Type: Internal Operations Platform + WordPress Monitoring Plugin

---

# Purpose

AP SiteCare is an internal operations platform used by Adriel Partners to monitor, manage, and eventually automate maintenance activities across multiple WordPress websites.

The system provides a centralized view of site health, update status, uptime, backup status, security posture, and operational metadata.

The dashboard is the primary product.

The WordPress plugin is a lightweight reporting agent that collects
site-specific information, securely reports it to the dashboard, and presents
a limited client-facing care summary inside WordPress Admin.

The dashboard owns operational awareness.

The plugin owns local data collection.

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

## Version One Goals

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

## Explicit Non-Goals

Version One will NOT:

- perform remote updates
- perform remote restores
- manage Cloudflare settings
- manage Hostinger settings
- execute AI-driven maintenance
- expose MCP execution tools

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

Dashboard:

- Cloudflare Access
- Google authentication

Plugin:

- Site ID
- Site Secret
- HMAC request signing

## Database

Initial recommendation:

- SQLite

Future migration path:

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

Hosted on an Adriel Partners VPS and protected by Cloudflare Access.

---

# 6. Domain Model

- Managed Site
- Site Credential
- Site Check-In
- Site Health Snapshot
- User
- Action Request (future)
- Audit Event

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

Cloudflare Access using Google authentication.

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

## SQLite Foundation

The dashboard uses `better-sqlite3` through a server-only database utility.

The database connection:

- enables WAL mode
- enables foreign key enforcement
- creates the configured parent directory when needed

Phase Three will add schema migrations, repositories, and domain tables.

## Cloudflare Access Boundary

Cloudflare Access remains the authentication provider.

The dashboard requires both trusted headers:

```text
Cf-Access-Authenticated-User-Email
Cf-Access-Jwt-Assertion
```

The application does not implement passwords, sessions, or a custom login
system.

Production traffic must reach the dashboard through Cloudflare Access. Direct
origin access must be restricted at the infrastructure layer because the
application trusts identity headers supplied by Cloudflare.

The health endpoint is intentionally unauthenticated:

```text
GET /api/health
```

It exists for local and container health verification and returns no sensitive
operational data.

## Environment Variables

```text
NUXT_DATABASE_PATH
NUXT_AUTH_DEVELOPMENT_BYPASS
NUXT_AUTH_DEVELOPMENT_EMAIL
NUXT_CREDENTIAL_ENCRYPTION_KEY
```

`NUXT_AUTH_DEVELOPMENT_BYPASS` must remain `false` outside local development.

## Deployment Foundation

The repository contains:

- a multi-stage Dockerfile
- a Docker Compose service
- a persistent volume mounted at `/data`
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

SQLite schema changes are applied through ordered migrations in:

```text
apps/dashboard/server/database/migrations.ts
```

Applied migrations are recorded in:

```text
schema_migrations
```

Migrations run when the database connection is initialized. Each migration is
transactional and is applied only once.

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
→ SQLite
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
→ SQLite
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
→ SQLite
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
bound to the configured SQLite database. It does not access database tables
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

Production backup policy must include the SQLite database and its WAL-related
files. A specific production backup schedule remains to be defined before
deployment.

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
→ SQLite
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

Uptime, security, backup freshness, and SSL status are represented as `unknown`
until a real provider integration supplies evidence.

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

# 23. Remote Backup and Restore Planning Foundation

Backup policy and restore planning are owned exclusively by the AP SiteCare
Dashboard. The WordPress plugin has no backup scheduling, retention, storage,
connection, or restore-decision responsibilities.

## Data Ownership

Migration 4 adds:

- `backup_policies`
- `hosting_connections`
- `backup_artifacts`
- `backup_jobs`
- `restore_plans`

Migration 5 adds encrypted Local VPS database connection fields, atomic job
claim/heartbeat/attempt fields, and artifact manifest/checksum/upload
verification evidence.

## Service Flow

```text
Dashboard UI
→ Protected Backup API
→ BackupService
→ BackupRepository + Provider/Connection Adapters
→ SQLite + AuditService
```

## Provider and Connection Adapters

Dropbox is the first storage-provider adapter. Its access token and base path
remain runtime environment configuration and are never returned through the
API or stored in backup policy records.

Local VPS is the first hosting-connection foundation. Local WordPress paths
must exist and resolve inside one of the comma-separated directories configured
by:

```text
NUXT_BACKUPS_ALLOWED_LOCAL_BASE_DIRECTORIES
NUXT_BACKUPS_DROPBOX_ENABLED
NUXT_BACKUPS_DROPBOX_TOKEN_STRATEGY
```

Dropbox account label, token strategy, enabled state, and base folder are
runtime-backed provider configuration. The token itself remains secret runtime
configuration. OAuth is represented as a token strategy foundation; an OAuth
authorization flow is not implemented yet.

Local paths must be mounted read-only into both the dashboard and backup-worker
containers.

SSH/SFTP, SFTP-only, database credential, hosting API, and manual connection
types are modeled but report unsupported until an execution adapter is
implemented and verified.

## Execution Boundary

The approved Local VPS + Dropbox worker can:

- configure and audit backup policies
- calculate restore capability
- queue manual-backup jobs
- atomically claim and execute one queued job at a time
- create gzip-compressed file archives and database dumps
- create and locally verify manifests and SHA-256 checksums
- upload and verify Dropbox objects
- inspect recorded backup evidence and client-safe manifests
- create and audit restore preflight plans

The worker cannot:

- automatically delete expired artifacts
- execute a restore
- run user-supplied shell commands
- write to arbitrary filesystem paths
- execute through MCP, agents, SSH/SFTP, or hosting APIs

All restore plans require confirmation, but no confirmation or execution route
exists yet.

## Protected Backup APIs

```text
GET  /api/backups
GET  /api/backups/:id
GET  /api/backups/:id/manifest
POST /api/backups/:id/verify
POST /api/backups/:id/retry
POST /api/backup-storage/dropbox/test

GET  /api/sites/:id/backups
PUT  /api/sites/:id/backups/policy
POST /api/sites/:id/backups/manual
POST /api/sites/:id/backups/connection-test

GET  /api/sites/:id/restore-plans
POST /api/sites/:id/restore-plans
```

Backup endpoints use explicit `{ ok, data }` and `{ ok, error }` envelopes.

## Backup Worker

```text
npm run backup-worker
npm run backup-worker:continuous
```

The worker uses fixed `/usr/bin/tar`, `/usr/bin/mysqldump`, and
`/usr/bin/gzip` executables with argument arrays and no shell. Database
passwords are encrypted at rest with `NUXT_CREDENTIAL_ENCRYPTION_KEY`, written
only to a protected temporary MySQL option file, and never returned or logged.
See `BACKUP_WORKER_OPERATIONS.md` for deployment requirements.
