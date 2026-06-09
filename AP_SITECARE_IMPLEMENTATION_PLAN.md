# AP_SITECARE_IMPLEMENTATION_PLAN.md

Version: 1.0
Project: AP SiteCare
Repository: `ap-sitecare`
Last Updated: 2026-06-09

---

# Purpose

This document defines the implementation sequence for AP SiteCare.

The goal is to ensure the project is built in deliberate phases.

Agents must complete one phase before moving to the next.

Do not skip ahead.

Do not build future phases early.

Do not implement features outside the current phase unless explicitly approved.

---

# Guiding Principles

1. Build the smallest useful version first.
2. Observation before action.
3. Dashboard before automation.
4. Visibility before integrations.
5. Design system before screens.
6. API before MCP.
7. Stability before convenience.
8. Beauty from the beginning.

---

# Phase 0 — Repository Foundation

## Goal

Establish project structure and documentation.

## Deliverables

Monorepo structure:

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

Required docs:

- AGENTS.md
- CODING_CONSTITUTION.md
- AP_SITECARE_ARCHITECTURE.md
- AP_SITECARE_DECISIONS.md
- AP_SITECARE_PROJECT_RULES.md
- AP_SITECARE_VISUAL_IDENTITY.md
- AP_SITECARE_IMPLEMENTATION_PLAN.md

## Exit Criteria

- Repository created
- Documentation committed
- Structure approved

---

# Phase 1 — Dashboard Foundation

## Goal

Create the dashboard application shell.

## Deliverables

Nuxt application:

- Nuxt 3
- TypeScript
- Nitro

Infrastructure:

- Docker support
- Environment configuration
- SQLite database

Cloudflare Access support:

- trusted identity headers
- protected dashboard routes

## Exit Criteria

- Dashboard boots successfully
- Authentication flow verified
- Database connection verified

---

# Phase 2 — Design System Foundation

## Goal

Build the visual system before feature screens.

## Deliverables

Design tokens:

- colors
- typography
- spacing
- radius
- borders
- shadows
- motion

UI primitives:

- AppButton
- AppCard
- AppInput
- AppBadge
- AppTable
- AppPanel
- AppEmptyState

Layout shell:

- Header
- Navigation
- Content area

## Exit Criteria

- Tokens implemented
- Primitives implemented
- Layout shell complete
- Visual review approved

---

# Phase 3 — Core Data Model

## Goal

Create foundational data structures.

## Deliverables

Database schema for:

- Sites
- Site Credentials
- Site Check-Ins
- Site Health Snapshots
- Audit Events

Repositories:

- SiteRepository
- CheckInRepository
- AuditRepository

Services:

- SiteService
- HealthService
- CredentialService

## Exit Criteria

- Migrations complete
- CRUD verified
- Services operational

---

# Phase 4 — Site Registration

## Goal

Allow managed sites to be registered.

## Deliverables

Features:

- Add Site
- Edit Site
- Disable Site
- Generate Site Credentials
- Rotate Credentials
- Test Connection

Dashboard pages:

- Site List
- Site Detail
- Site Registration

## Exit Criteria

- Site registration complete
- Credential flow verified

---

# Phase 5 — WordPress Reporter Plugin

## Goal

Build the reporting plugin.

## Deliverables

Plugin settings:

- Dashboard URL
- Site ID
- Site Secret

Features:

- Test Connection
- Manual Check-In
- Scheduled Check-In

Collected data:

- WordPress version
- PHP version
- Plugin update count
- Theme update count
- Last cron run

## Exit Criteria

- Plugin communicates successfully
- Check-ins are recorded

---

# Phase 6 — Health Dashboard

## Goal

Display operational health information.

## Deliverables

Dashboard views:

- Site Cards
- Site Detail Page
- Health Status Indicators
- Update Status Indicators

Statuses:

- Healthy
- Attention Needed
- Critical
- Unknown

## Exit Criteria

- Site health visible
- Status calculation working

---

# Phase 7 — Audit and History

## Goal

Track important events.

## Deliverables

Audit logging:

- Site Created
- Site Updated
- Token Rotated
- Check-In Received
- Site Disabled

Audit views:

- Site Audit Log
- System Audit Log

## Exit Criteria

- Audit trail functional

---

# Phase 8 — Operational Enhancements

## Goal

Improve visibility without introducing automation.

## Deliverables

Additional fields:

- Hosting Provider
- Backup Strategy
- Risk Level
- Notes

Dashboard enhancements:

- Filters
- Search
- Sorting

## Exit Criteria

- Operators can quickly identify problem sites

---

# Phase 9 — External Integrations

## Goal

Begin collecting information from external systems.

## Deliverables

Research and implement:

- Hostinger API integration
- Cloudflare API integration
- Dropbox verification integration

Examples:

- backup visibility
- uptime visibility
- security visibility

## Exit Criteria

- At least one integration operational

---

# Phase 10 — Agent Readiness Layer

## Goal

Prepare for future AI workflows.

## Deliverables

API enhancements:

- list sites
- get site health
- get site history
- get update status

Action Request model:

- create
- list
- approve
- reject

No execution capabilities yet.

## Exit Criteria

- Agents can inspect and propose

---

# Phase 11 — MCP Layer

## Goal

Expose AP SiteCare to AI agents.

## Deliverables

MCP server exposing:

- list_sites
- get_site_health
- get_backup_status
- get_site_notes
- create_action_request

MCP must use existing services.

MCP must not bypass business rules.

## Exit Criteria

- MCP verified with at least one agent

---

# Phase 12 — Action Layer (Future)

## Goal

Allow controlled execution of maintenance activities.

## Examples

Potential future actions:

- update plugins
- create backup
- verify backup
- run diagnostics
- initiate restore

All actions must:

- be auditable
- be reviewable
- be permission controlled

## Exit Criteria

Not currently defined.

Implementation requires explicit approval.

---

# Out of Scope for Version One

Do not build:

- client-facing portals
- billing
- subscriptions
- SaaS onboarding
- white-labeling
- remote updates
- remote restores
- automatic AI execution

---

# Definition of Success

Version One succeeds when:

- a site can be registered easily
- a plugin can report health data
- the dashboard clearly shows site status
- operators can identify issues quickly
- the system remains beautiful
- future automation remains possible without redesign
