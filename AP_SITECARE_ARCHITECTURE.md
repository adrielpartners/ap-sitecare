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
