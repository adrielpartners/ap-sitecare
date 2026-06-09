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

The WordPress plugin exists only as a lightweight reporting agent that collects site-specific information and securely reports it to the dashboard.

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
- provide future action endpoints

The plugin is not the product.

The dashboard is the product.

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
- implement MCP

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
```

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
