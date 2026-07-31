# AP_SITECARE_DECISIONS.md

Version: 2.0
Project: AP SiteCare
Repository: `ap-sitecare`
Last Updated: 2026-07-30

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

# Active Supersession Index

The following later decisions intentionally replace or narrow earlier Version
One decisions:

- Decision 029 supersedes Decision 007's active SQLite choice.
- Decision 030 supersedes Decisions 005 and 011 after the authentication
  cutover.
- Decisions 031, 033, 035, and 037 narrow the observation-only and read-only
  boundaries in Decisions 002, 017, and 018 only for explicitly assigned,
  controlled roadmap phases.
- Decision 035 narrows Decisions 024 through 027 to the approved SiteCare Pro
  long-term backup responsibility.
- Decision 036 supersedes Decision 014 where a specific retention period now
  exists.
- Decision 037 does not grant execution access to agents or MCP; Decision 019
  remains in force.

The active implementation sequence and current completion status are defined
in `AP_SITECARE_IMPLEMENTATION_PLAN.md`.

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

---

# Decision 027: Auto-detect backup source details through signed plugin check-ins

## Decision

The WordPress plugin sends backup-source details, including the database
password, through the existing signed HMAC check-in boundary.

The dashboard stores the password only as encrypted hosting-connection
credential material and redacts it from check-in history.

## Rationale

Operators should not have to copy database settings from `wp-config.php` into
the dashboard. The plugin already runs inside WordPress and can detect the
site path and database constants accurately.

## Tradeoffs

- The plugin reporting payload now carries sensitive credential material.
- The dashboard encryption key becomes even more operationally important.
- File backups still require a worker-visible mounted source path.
- The backup setup UI can become dramatically simpler.

## Date Adopted

2026-06-25

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
- The server must run with access to the same configured application database,
  currently PostgreSQL.

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

---

# Decision 026: Manage backup destinations centrally with explicit site overrides

## Decision

AP SiteCare owns a central registry of backup destinations. Managed sites
inherit the enabled central destination pool by default, may use an explicit
site-specific override, and may opt into multiple destinations only through a
site-level setting.

The original environment-configured Dropbox connection remains a
runtime-managed central destination. Additional destination credentials may be
entered through protected dashboard APIs and stored encrypted at rest with
`NUXT_CREDENTIAL_ENCRYPTION_KEY`.

Queued backup jobs snapshot their destination identifiers. Dropbox is the only
currently executable destination adapter. Google Drive and Amazon/S3-compatible
destinations remain configuration-only until their execution adapters are
implemented and verified.

## Rationale

Most managed sites should use Adriel Partners' shared storage pool, while some
clients require isolated or redundant storage. Central defaults reduce routine
configuration, and explicit overrides preserve client-specific flexibility
without silently changing queued work.

## Tradeoffs

- The database now owns encrypted provider credentials in addition to runtime
  configuration.
- Encryption-key backup and rotation become more operationally important.
- Multiple destinations increase upload time and partial-failure exposure.
- Provider-specific execution remains unavailable until each adapter is
  separately implemented and verified.

## Date Adopted

2026-06-13

## Reversibility

Moderate.

---

# Decision 028: Use three centrally enforced SiteCare plans

Implementation status: completed in roadmap Phase 3 on 2026-07-31. Migration
8, `EntitlementService`, Admin lifecycle/override APIs, client and site plan
interfaces, execution guards, and activation intents implement this decision.

## Decision

The internal plan identifiers are `sitecare-core`, `sitecare-plus`, and
`sitecare-pro`. Their customer-facing names are SiteCare Core, SiteCare Plus,
and SiteCare Pro.

A central entitlement service determines feature access. Administrative
overrides are temporary, audited, and do not change the underlying plan.
Upgrade, downgrade, cancellation, and suspension follow the effective-date and
retention behavior defined in the active implementation plan.

## Rationale

Plans must produce consistent behavior across UI, APIs, workers, reports,
agents, and client access.

## Tradeoffs

- Entitlement checks become a required service dependency.
- Plan lifecycle dates must be maintained before billing exists.

## Date Adopted

2026-07-30

## Reversibility

Moderate.

---

# Decision 029: Migrate the Dashboard from SQLite to PostgreSQL

Implementation status: completed in roadmap Phase 1 on 2026-07-30.

## Decision

PostgreSQL becomes the durable database before application authentication,
general scheduling, and higher-volume automation are implemented.

The migration must preserve existing identifiers, encrypted data, operational
history, backup records, and audit evidence. Production cutover requires a
backup, rehearsal, validation, and rollback plan.

This supersedes Decision 007's active SQLite choice.

## Rationale

User sessions, event ingestion, durable jobs, concurrent workers, outbox
delivery, and multi-client authorization need stronger concurrency and
operational characteristics.

## Tradeoffs

- Adds a database service and migration work.
- Reduces the simplicity of the current single-file database.

## Date Adopted

2026-07-30

## Reversibility

Difficult after production cutover.

---

# Decision 030: Use application-owned email/password authentication and RBAC

## Decision

The Dashboard will authenticate human users with email and password and use
revocable, renewable sessions. Initial roles are Admin, Team Member, and
Client.

Admins have unrestricted access. Team Members have operational access to all
sites by default with optional site restrictions, but do not manage user roles
or master credentials by default. Clients receive read-only access to their
own client account and sites.

Cloudflare continues proxy, TLS, WAF, rate-limiting, and origin-protection
duties without showing a second human login. Admin MFA becomes mandatory
before centralized update or restore execution.

This supersedes Decisions 005 and 011 after the authentication cutover.

Implementation note (2026-07-30): the cutover is implemented. Cloudflare
identity headers no longer grant Dashboard access. Passwords use salted scrypt,
sessions are opaque and server-side, unsafe requests are CSRF-protected, and
collection/resource queries enforce site scope.

## Rationale

The product needs durable staff and client accounts, role-specific behavior,
and strict multi-client data isolation.

## Tradeoffs

- The application now owns password, session, invitation, recovery, and
  authorization security.
- Cloudflare Access can no longer be the only identity boundary.

## Date Adopted

2026-07-30

## Reversibility

Moderate.

---

# Decision 031: Use durable jobs, a transactional outbox, and API-based email

## Decision

Scheduled and long-running work runs through durable job records with
idempotency, leases, heartbeat, retries, per-site locks, verification, and
audit history.

Reports and notifications are generated and sent by the Dashboard, never the
WordPress plugin. Email uses provider-neutral REST adapters. Brevo is the first
fully operational provider and uses an API key. Global settings own provider,
From, Reply-To, and branding; per-site settings own recipients and email
categories. Multiple recipients are supported.

Telegram and SMS receive interface foundations only.

## Rationale

Later uptime, report, backup, update, and email workflows need one reliable
execution and delivery model.

## Tradeoffs

- Adds scheduler and worker operations.
- Requires webhook, retry, bounce, and suppression handling.

## Date Adopted

2026-07-30

## Reversibility

Moderate.

---

# Decision 032: Use a durable WordPress HMAC connection and tolerate Hostinger API limits

## Decision

Each WordPress site uses a long-lived per-site HMAC connection with automatic
dual-key rotation and no routine technician reauthentication.

The plugin reports detailed WordPress core, theme, and plugin inventory and
update activity. The Dashboard records update checks, prior and resulting
versions, successful work, and failures.

The initial hosting portfolio is one Hostinger Agency account using shared
Cloud Pro hosting. Non-Hostinger sites are excluded. Hostinger API fields and
installation IDs are used only when actually available. Hostinger daily-backup
visibility is optional and must not block delivery.

## Rationale

WordPress provides the most reliable local update evidence, while Hostinger's
shared-hosting API may not expose every desired field.

## Tradeoffs

- The plugin/Dashboard contract becomes richer and versioned.
- Hostinger visibility may vary by account or product capability.

## Date Adopted

2026-07-30

## Reversibility

Moderate.

---

# Decision 033: Use Cloudflare for uptime probes and read-only security status

## Decision

Cloudflare performs uptime probes. SiteCare Pro defaults to a 5-minute normal
interval. After the first failure, the affected site moves to 60-second
checking when the Cloudflare product permits it. An alert begins after the
second consecutive failure. A successful check immediately restores the normal
interval.

Redirects are followed; a final successful 2xx page is up and a dead end is
down. TLS/certificate errors are alerted separately and do not count as
downtime. Raw monitoring history is retained for 60 days. The Dashboard owns
incidents, recovery reports, maintenance exclusions, and email notification.

The Site Detail Security Status area is read-only. `Active` is green,
`Inactive` is red, and `Pending` is yellow only when a real transitional state
exists. API-inaccessible controls may be manually marked by a technician with
audited evidence.

Auto Minify is removed from the standard because Cloudflare deprecated it.
Proxy and Global CDN are one derived control, Brotli is represented as
Cloudflare-managed compression, and DDoS protection is informational because
Cloudflare manages it.

## Rationale

Cloudflare already owns network-edge health and security. The Dashboard should
coordinate entitlements and operational response rather than duplicate a
probe system or modify security settings automatically.

## Tradeoffs

- Behavior depends on Cloudflare product and API availability.
- Missed notifications require periodic API reconciliation.

## Date Adopted

2026-07-30

## Reversibility

Moderate.

---

# Decision 034: Generate SiteHealth Reviews in the Dashboard

## Decision

A SiteHealth Checkup collects evidence and produces a SiteHealth Review.
SiteCare Plus and SiteCare Pro receive one automated Checkup per year. A
technician may run a Checkup manually for any site regardless of plan.

The Dashboard assembles a draft for technician review, records manual
findings, creates recommendations, and sends the published Review. Clients are
instructed to email Adriel Partners to approve all recommendations. Cleanup is
separate work and never occurs automatically from the Review.

Service Time tracking is excluded.

## Rationale

Automation should reduce evidence gathering while technicians retain
professional judgment and clients retain approval control.

## Tradeoffs

- Some findings remain inherently manual.
- Cleanup requires a later controlled workflow.

## Date Adopted

2026-07-30

## Reversibility

Easy.

---

# Decision 035: Limit Dashboard long-term backups to SiteCare Pro

## Decision

Hostinger owns routine daily backups, 30-day retention, and Hostinger
restoration for every plan. The Dashboard owns only SiteCare Pro long-term
backups and their supervised restoration workflow.

Pro backups run monthly, contain full website files and the database, retain
for two years, and use one independent off-site destination initially.
Dropbox is preferred and must use durable OAuth refresh authorization.

The default configurable root is `/SiteCare Backups`. Objects use stable
client folders followed by year and month. Filenames include the canonical
website hostname, timestamp, and backup ID. Packages use portable standard
archives, SQL, manifests, checksums, and restoration instructions without
proprietary splitting.

This narrows and supersedes portions of Decisions 024, 025, 026, and 027.

## Rationale

SiteCare is responsible for portable long-term protection, not duplicating
Hostinger's daily service.

## Tradeoffs

- Existing generalized backup policies must be reconciled with plan
  entitlements.
- Shared-hosting source access and durable Dropbox OAuth require proof.

## Date Adopted

2026-07-30

## Reversibility

Moderate.

---

# Decision 036: Make provider ownership and technician overrides explicit

## Decision

Hostinger is authoritative for hosting and routine backups. WordPress is
authoritative for installed software and local update state. Cloudflare is
authoritative for edge security and uptime probes. SiteCare is authoritative
for clients, plans, entitlements, exceptions, reports, incidents,
notifications, and long-term backups.

Technician findings supersede automated findings but must record actor,
timestamp, reason, source, and optional expiration while preserving original
evidence.

The system minimizes collected data and excludes unnecessary passwords,
authentication cookies, license keys, content bodies, and private media.
Provider credentials are encrypted, masked, and excluded from logs.

Raw uptime history retains for 60 days. Update and backup activity and email
delivery metadata retain for at least two years. Incident summaries,
SiteHealth Reviews, and audit records retain while the client record exists.
Backup artifact expiration remains governed by the artifact's original
retention date.

This supersedes Decision 014's indefinite retention rule where a specific
retention period now exists.

## Rationale

Clear ownership avoids conflicting facts, and data minimization reduces
privacy and security exposure.

## Tradeoffs

- Retention cleanup becomes required background work.
- Manual findings need an explicit evidence model.

## Date Adopted

2026-07-30

## Reversibility

Moderate.

---

# Decision 037: Permit controlled centralized plugin package rollout

## Decision

An Admin may upload a WordPress plugin ZIP, automatically identify connected
sites where that plugin is installed and behind the uploaded version, adjust
the target list, approve a staged rollout, and inspect per-site results.

The workflow requires package validation, immutable checksums, preflight,
human confirmation, canary deployment, per-site locking, bounded concurrency,
before/after version evidence, failure thresholds, verification, audit
history, and a tested rollback or technician-recovery strategy.

Team Members, Clients, agents, and MCP tools may not bypass the Admin approval
boundary.

This supersedes Decision 002 only for this explicitly controlled action.

## Rationale

Commercial and manually distributed plugins currently require repetitive
site-by-site uploads.

## Tradeoffs

- Package upload and remote execution substantially increase security risk.
- Partial deployment and recovery must be first-class workflow states.

## Date Adopted

2026-07-30

## Reversibility

Moderate.

---

# Decision 038: Use phase-level durable handoffs for human and AI agents

## Decision

The active implementation plan is executed one user-assigned phase at a time.
Each phase contains milestones and ends with verification, documentation
updates, known limitations, deployment notes, and a recommended next
assignment.

The legacy Version One plan remains historical. Agents must update the active
roadmap and all affected durable documents before handing off.

## Rationale

Work will alternate between humans and AI agents. Durable status must not
depend on access to a particular chat.

## Tradeoffs

- Documentation is part of every phase's completion cost.
- Agents must resist implementing attractive later-phase work early.

## Date Adopted

2026-07-30

## Reversibility

Easy.

---

# Decision 039: Use PostgreSQL leases for general automation and a recipient-level transactional outbox

## Decision

SiteCare uses PostgreSQL-backed schedules, jobs, attempts, leases, heartbeats,
idempotency keys, and per-scope operation locks for general durable workflows.
The existing backup worker remains specialized while later phases register
their work with the general automation worker.

Email uses one transactional outbox row per recipient. The triggering domain
event and its messages commit together. A separate worker delivers through a
provider-neutral REST interface, records provider acceptance separately from
delivery, retries with bounded backoff, processes authenticated deduplicated
webhooks, and suppresses permanent delivery risks.

Brevo is operational first. Mailgun, Postmark, and SendGrid retain encrypted
configuration foundations only. Telegram and SMS retain interface stubs only.
Global provider/sender/branding settings are separate from per-site recipients
and categories. Rendered bodies are purged once no longer needed.

## Rationale

Later monitoring, update, report, and backup phases need one restart-safe
orchestration contract. Recipient-level outbox state prevents a partial send
from being confused with complete notification delivery and keeps web requests
independent of provider availability.

## Tradeoffs

- PostgreSQL is both application state and the initial queue coordinator, so
  database availability and maintenance are operational dependencies.
- Cooperative cancellation cannot stop an unsafe handler mid-call; handlers
  must define safe interruption boundaries.
- Additional email and notification providers require explicit adapters and
  webhook normalization before activation.

## Date Adopted

2026-07-31

## Reversibility

Moderate.

---

# Decision 040: Rotate WordPress HMAC keys automatically and treat Hostinger visibility as optional evidence

## Decision

WordPress connections remain site-scoped HMAC connections rather than durable
administrator passwords or application passwords. SiteCare automatically
delivers a pending successor key to an authenticated plugin, confirms it on
first use, and retains the predecessor for a bounded 14-day overlap. Initial
connection and explicit recovery show a raw secret once. Revocation immediately
removes every accepted key. Exact signed requests are claimed in PostgreSQL to
prevent replay.

WordPress contract version 2 is authoritative for installed core, plugin, and
theme state and update activity. The Dashboard may request a signed,
observation-only refresh, but the plugin does not become a general remote
execution agent.

Hostinger sites are matched by normalized domain and do not require a WordPress
installation ID. Hosting website metadata and management links are retained
when available. Missing shared-hosting backup evidence is recorded as
`not-available`, never inferred as success or failure, and never blocks update
intelligence or SiteCare launch. Hostinger routine backups/restoration stay
separate from SiteCare long-term backups/restoration.

## Rationale

Automatic dual-key rotation meets the set-it-and-forget-it operating goal
without keeping a single permanent secret forever. Direction-specific signed
observation requests provide central refresh without creating the broader risk
of arbitrary remote administration. Optional Hostinger evidence reflects the
actual public API surface and avoids coupling core SiteCare behavior to fields
that vary by hosting product.

## Tradeoffs

- A site that misses the full rotation overlap needs an explicit Admin
  reconnect.
- The plugin must retain its previous key temporarily for safe retry.
- Commercial license/support status can remain unknown when a vendor offers no
  safe discovery interface.
- Live Hostinger capability can differ from its published schema and must be
  verified after the production Agency token is configured.

## Date Adopted

2026-07-31

## Reversibility

Moderate.

---

# Decision 041: Treat Cloudflare state changes as provider evidence and confirm downtime through reconciliation

## Decision

Cloudflare performs all homepage probes. SiteCare configures a Cloudflare
Health Check to follow redirects, require a final `2xx`, validate TLS, and
report provider state after one failure. SiteCare never probes the site as a
fallback.

The first unhealthy observation is non-incident transient state and changes
that Health Check to 60 seconds. Because Cloudflare notifications represent
state changes rather than every failed probe, a per-site 60-second Dashboard
job reads the Cloudflare Health Check API during the unhealthy state. The
second distinct unhealthy observation confirms downtime and triggers
recipient-level email. A successful observation immediately restores the
effective normal interval and sends a recovery report.

TLS/certificate errors, maintenance-window failures, and unknown provider
states do not count toward downtime. Raw observations retain for 60 days;
incident summaries remain. Cloudflare security synchronization is read-only.
Technician evidence is append-only and may supersede the displayed API result
without destroying it.

Cloudflare webhook destinations and notification policies are deployment-owned
configuration. SiteCare validates their IDs and shared secret readiness but
does not create or rotate them automatically in Phase 6.

## Rationale

This keeps the probe source unambiguous, produces the approved approximately
two-minute alert sequence, and repairs missed webhooks without introducing a
second monitoring network beside Cloudflare.

## Tradeoffs

- The automation worker and Cloudflare API must be available during an
  unhealthy state to confirm a second observation quickly.
- Cloudflare plan limitations can make optional security controls unavailable.
- Production deployment requires a one-time Cloudflare webhook and policy
  setup outside SiteCare.

## Date Adopted

2026-07-31

## Reversibility

Moderate.
