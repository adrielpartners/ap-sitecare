# AP_SITECARE_DECISIONS.md

Version: 1.0
Project: AP SiteCare
Repository: `ap-sitecare`
Last Updated: 2026-06-09

---

# Purpose

This file records major architectural, operational, and product decisions for AP SiteCare.

Use this file to prevent future developers or AI agents from repeatedly re-litigating settled choices.

Each decision should include:

- decision
- rationale
- tradeoffs
- date adopted
- reversibility

---

# Decision 001: AP SiteCare is a dashboard-first platform

## Decision

The AP SiteCare Dashboard is the product.

The WordPress plugin is a supporting component.

## Rationale

The purpose of AP SiteCare is centralized operational visibility across many sites.

The plugin exists only to collect and report local site data.

## Tradeoffs

- Requires two deployable components.
- Requires secure communication between dashboard and plugin.
- Creates clearer separation of responsibilities.

## Date Adopted

2026-06-09

## Reversibility

Difficult.

---

# Decision 002: Version One is observation-only

## Decision

Version One focuses on monitoring and visibility only.

No remote updates, restores, or destructive actions.

## Rationale

Observation is safer and simpler than automation.

Trust should be established before action capabilities are introduced.

## Tradeoffs

- Less powerful initially.
- Significantly lower risk.
- Faster path to a usable product.

## Date Adopted

2026-06-09

## Reversibility

Easy.

---

# Decision 003: AP SiteCare is API-first

## Decision

All dashboard functionality should be accessible through internal APIs.

The UI consumes the same APIs future agents will use.

## Rationale

Supports automation, integrations, MCP, and future tooling without architectural redesign.

## Tradeoffs

- Requires more API planning early.
- Improves long-term flexibility.

## Date Adopted

2026-06-09

## Reversibility

Difficult and not recommended.

---

# Decision 004: Agent-ready, not agent-controlled

## Decision

The platform should support future AI agents but should not grant unrestricted automated control.

## Rationale

Operational safety is more important than maximum automation.

## Tradeoffs

- Additional approval workflows may be required later.
- Reduces risk of unintended actions.

## Date Adopted

2026-06-09

## Reversibility

Moderate.

# Decision 005: Cloudflare Access owns authentication

## Decision

Dashboard authentication is handled by Cloudflare Access using Google login.

The application should not implement its own authentication system.

## Rationale

Reduces complexity and maintenance burden.

## Tradeoffs

- Depends on Cloudflare Access.
- Greatly simplifies security and user management.

## Date Adopted

2026-06-09

## Reversibility

Easy.

---

# Decision 006: VPS-hosted deployment

## Decision

AP SiteCare will be hosted on an Adriel Partners VPS.

Primary domain:

sitecare.adrielpartners.com

## Rationale

Maintains portability and operational control.

## Tradeoffs

- Self-managed deployment.
- Greater flexibility and ownership.

## Date Adopted

2026-06-09

## Reversibility

Easy.

---

# Decision 007: SQLite first, PostgreSQL later if needed

## Decision

Version One uses SQLite.

Future growth may justify PostgreSQL.

## Rationale

The initial data volume is small.

SQLite minimizes operational complexity.

## Tradeoffs

- Less scalable than PostgreSQL.
- Faster development and deployment.

## Date Adopted

2026-06-09

## Reversibility

Easy if repositories remain database-agnostic.

---

# Decision 008: Future actions flow through Action Requests

## Decision

Future automation should be mediated through Action Requests.

Actions are proposed, tracked, audited, and eventually executed.

## Rationale

Creates a safe operational boundary between observation and execution.

## Tradeoffs

- Additional implementation work later.
- Better auditability and safety.

## Date Adopted

2026-06-09

## Reversibility

Moderate.

# Decision 009: Hostinger, Cloudflare, and WordPress remain sources of truth

## Decision

AP SiteCare aggregates operational information.

It does not replace Hostinger, Cloudflare, or WordPress.

## Rationale

Reduces duplication and minimizes integration complexity.

## Tradeoffs

- Requires external integrations.
- Keeps the platform focused.

## Date Adopted

2026-06-09

## Reversibility

Difficult and not recommended.

---

# Decision 010: Beauty is a functional requirement

## Decision

Visual quality is a first-class requirement.

The dashboard must use a token-driven design system and support future visual refinement without major refactoring.

## Rationale

The dashboard will be used frequently and should remain calm, elegant, and enjoyable to use.

## Tradeoffs

- Requires design discipline.
- Improves long-term usability.

## Date Adopted

2026-06-09

## Reversibility

Not recommended.

---

# Decision 011: Trust Cloudflare Access identity headers at the application boundary

## Decision

The dashboard requires Cloudflare Access's authenticated email and JWT
assertion headers for protected requests.

The application trusts those headers and does not implement a second
authentication system or perform independent JWT verification in Version One.

Direct origin access must be restricted at the infrastructure layer.

An explicit authentication bypass is available only for local development.

## Rationale

Cloudflare Access owns dashboard authentication under Decision 005.

Requiring both headers gives the application a clear identity boundary while
avoiding a duplicate authentication system.

## Tradeoffs

- Production origin access must be restricted correctly.
- Local development requires an explicit bypass.
- The application remains dependent on Cloudflare Access for authentication.

## Date Adopted

2026-06-09

## Reversibility

Easy.

---

# Decision 012: Ship a restrained light theme as the initial visual foundation

## Decision

AP SiteCare will initially use a calm light theme built from semantic CSS
tokens.

The palette uses warm neutral surfaces, deep ink text, a muted blue primary,
and status colors only for operational meaning.

UI primitives own reusable visual styling. Pages and future feature components
compose those primitives.

## Rationale

The visual identity requires a premium operations cockpit that is calm,
trustworthy, and easy to scan.

A semantic token foundation keeps future visual refinement and dark-mode work
reversible.

## Tradeoffs

- Dark mode is prepared for but not implemented.
- The initial theme intentionally favors restraint over visual novelty.
- New UI work must compose established primitives instead of styling freely.

## Date Adopted

2026-06-09

## Reversibility

Easy.

---

# Decision 013: Store recoverable site secrets encrypted at rest

## Decision

Site secrets used for plugin HMAC authentication are encrypted at rest with
AES-256-GCM and an environment-provided encryption key.

Only one active credential may exist for each site. Issuing a new credential
revokes the previous credential.

The raw secret is returned only during initial issuance.

## Rationale

Future HMAC verification requires the dashboard to recover the shared secret.
A one-way password-style hash would not support that verification model.

Encryption preserves recoverability without storing secrets plaintext.

## Tradeoffs

- Production must securely manage and back up the encryption key.
- Losing the encryption key requires rotating all site credentials.
- Rotating the encryption key itself will require an intentional migration.

## Date Adopted

2026-06-09

## Reversibility

Moderate.

---

# Decision 014: Retain Version One operational history indefinitely

## Decision

Version One does not automatically delete site check-ins, health snapshots,
credential history, or audit events.

Sites are disabled rather than deleted through the service layer.

## Rationale

Initial data volume is expected to be small, and operational history improves
diagnosis and auditability.

## Tradeoffs

- Storage usage will grow over time.
- A retention policy may be needed as the managed-site count and check-in
  frequency grow.

## Date Adopted

2026-06-09

## Reversibility

Easy.

---

# Decision 015: Sign plugin requests over timestamp and exact body

## Decision

WordPress reporter requests use HMAC-SHA256 with the active site secret.

The signed message is the ISO 8601 request timestamp, a period separator, and
the exact JSON request body. The signature is sent as lowercase hexadecimal.
Requests outside a five-minute clock-skew window are rejected.

## Rationale

Binding both timestamp and body prevents payload tampering and limits replay
exposure while keeping the protocol small enough for native WordPress APIs.

## Tradeoffs

- Dashboard and WordPress clocks must remain reasonably synchronized.
- Credential rotation immediately invalidates the prior plugin secret.
- The exact body must be signed before transmission.

## Date Adopted

2026-06-09

## Reversibility

Moderate.

---

# Decision 016: Derive operational health centrally

## Decision

`HealthService` is the single owner of AP SiteCare health status.

A site is unknown before its first check-in, healthy with a recent
update-free report, attention-needed with one to nine updates, and critical
with ten or more updates or a check-in older than 24 hours.

## Rationale

Central calculation keeps the dashboard, APIs, and future agents aligned and
prevents UI-specific interpretations of health.

## Tradeoffs

- The initial thresholds are intentionally simple.
- Provider-specific security and backup signals may refine status later.
- Stale status is calculated at read time rather than requiring background
  mutation.

## Date Adopted

2026-06-09

## Reversibility

Easy.

---

# Decision 017: External integrations are read-only provider clients

## Decision

Version One external integrations use small provider clients coordinated by
`IntegrationService`. They inspect provider state but never modify it.

## Rationale

This adds useful operational visibility while preserving provider ownership
and the observation-before-action doctrine.

## Tradeoffs

- Provider credentials and account-specific configuration are required for
  live checks.
- Results are checked on demand rather than synchronized by background jobs.
- Provider APIs may require future adapter maintenance.

## Date Adopted

2026-06-09

## Reversibility

Easy.

---

# Decision 018: Approval records intent but never executes in Version One

## Decision

Action Requests may be created, approved, or rejected. Approval changes the
proposal record and emits an audit event, but it does not trigger execution.

## Rationale

Agents need a structured way to propose work without gaining operational
control.

## Tradeoffs

- Approved proposals still require a human to act outside AP SiteCare.
- A future execution layer will require a separate architecture and approval.

## Date Adopted

2026-06-09

## Reversibility

Moderate.

---

# Decision 019: MCP is inspection-and-proposal only

## Decision

The MCP server exposes site inspection, backup context, notes, and Action
Request creation through existing services.

It exposes no approval or execution tools.

## Rationale

This makes AP SiteCare useful to agents while preserving application rules,
auditability, and human control.

## Tradeoffs

- MCP clients cannot complete maintenance work.
- The server must run with access to the same configured SQLite database.

## Date Adopted

2026-06-09

## Reversibility

Easy.

---

# Decision 020: Include the inspection-only MCP layer in Version One

## Decision

Phase 11's inspection-and-proposal MCP layer is included in Version One.

This supersedes the original Version One MCP non-goal only for tools that
inspect AP SiteCare state or create Action Requests. Execution tools remain
out of scope.

## Rationale

The user explicitly approved continuing through all defined phases, and the
implemented MCP boundary preserves the agent-ready, not agent-controlled
decision.

## Tradeoffs

- Version One has one additional deployable process.
- MCP protocol compatibility must be maintained.
- The action boundary remains intentionally incomplete.

## Date Adopted

2026-06-09

## Reversibility

Easy.

---

# Decision 021: Derive the main dashboard through a composed overview service

## Decision

The main operations dashboard consumes one overview API backed by
`DashboardService`.

The service composes existing site, health, and audit services and a computed
scheduled-task service. It owns portfolio aggregates and managed-site
pagination.

Unavailable operational signals remain explicitly unknown.

## Rationale

The dashboard needs one consistent operational projection without moving
business rules into the page or inventing health data.

## Tradeoffs

- The overview response is purpose-built for the dashboard.
- Additional provider signals must be added to services before they can affect
  health.
- Scheduled tasks are planning placeholders until a real job system exists.

## Date Adopted

2026-06-10

## Reversibility

Easy.

---

# Decision 022: Use a dark mission-control visual system

## Decision

The operations dashboard uses a premium dark design system built from semantic
tokens, restrained gradients, elevated surfaces, and status-specific accents.

## Rationale

The dashboard is an internal operations cockpit used for sustained monitoring.
The dark system supports calm scanning, clear hierarchy, and the requested
mission-control character.

## Tradeoffs

- The original light theme is superseded.
- New UI work must preserve adequate contrast and token discipline.
- A separate light theme is not currently implemented.

## Date Adopted

2026-06-10

## Reversibility

Easy because visual values remain token-driven.

---

# Decision 023: Add a limited client visibility layer to the WordPress plugin

## Decision

The AP SiteCare WordPress plugin provides a polished, read-only care summary
inside WordPress Admin and a compact WordPress Dashboard widget.

The dashboard remains the source of truth for aggregated care activity. The
plugin combines immediate local WordPress update data with a locally cached,
signed dashboard summary.

## Rationale

Clients benefit from clear reassurance that their website is being monitored
and maintained without receiving access to the internal operations dashboard.

Caching keeps wp-admin fast and usable when the dashboard is temporarily
unavailable.

## Tradeoffs

- The plugin gains a small presentation and cache responsibility.
- Dashboard summary changes require maintaining a client-safe API contract.
- Provider metrics remain unknown until real integrations supply evidence.

## Date Adopted

2026-06-10

## Reversibility

Easy.

---

# Decision 024: Establish remote backup management without execution

## Decision

AP SiteCare owns remote backup policy, connection capability, artifact
evidence, queued-job planning, and restore preflight in the dashboard.

Version One deliberately stops before archive creation, database dumping,
artifact upload, automatic retention deletion, and destructive restore
execution.

## Rationale

Backup and disaster-recovery automation require durable records, provider and
hosting abstractions, strict path controls, auditability, background execution,
and explicit restore safeguards before operational actions can be trusted.

## Tradeoffs

- Operators can configure and inspect the intended system before it can run.
- Queued manual backup records require a future approved worker to execute.
- Dropbox and local VPS are the first foundations; other adapters remain
  explicitly unsupported.
- Restore plans can expose readiness gaps without risking site data.

## Date Adopted

2026-06-10

## Reversibility

Moderate.

---

# Decision 025: Execute Local VPS backups in a separate claim-based worker

## Decision

AP SiteCare may execute backups only for Local VPS connections using the
separate backup worker and Dropbox storage adapter. Dashboard requests queue
jobs but never create archives, dump databases, or upload files.

The worker atomically claims one job, uses fixed executable arguments, rejects
unsafe paths and symlinks, stores database passwords encrypted at rest, creates
and verifies manifests and SHA-256 checksums, uploads and verifies Dropbox
objects, records audit events, and cleans isolated temporary files.

Restore execution, automatic retention deletion, remote connection execution,
MCP execution, and agent-triggered execution remain prohibited.

## Rationale

A dedicated process keeps heavy and failure-prone backup work outside request
handling while making job ownership, evidence, failure recovery, and
operational deployment inspectable.

## Tradeoffs

- Operators must mount Local VPS source directories read-only into the worker.
- The worker requires tar, gzip, mysqldump, Dropbox credentials, and the
  credential encryption key.
- Simple Dropbox metadata verification confirms path and size, not a remote
  SHA-256 digest.
- Scheduled job creation and automatic retention deletion remain future work.

## Date Adopted

2026-06-12

## Reversibility

Moderate.
