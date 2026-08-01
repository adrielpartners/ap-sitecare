# AP SiteCare Implementation Plan

Version: 2.3

Project: AP SiteCare

Repository: `ap-sitecare`

Last Updated: 2026-07-31

Roadmap Status: Phase 1 through Phase 7 implementation complete. The production
database/application-authentication deployment cutover remains gated and may
be completed independently before production release.

---

# 1. Purpose

This document is the active implementation roadmap for AP SiteCare.

It replaces the original Version One phase sequence, which is preserved in:

```text
instructions/AP_SITECARE_IMPLEMENTATION_PLAN_LEGACY.md
```

The legacy plan describes how the current codebase was built. This plan
describes how to move from that working baseline to the approved SiteCare
service platform.

Work proceeds one phase at a time. A phase begins only when the user explicitly
assigns it. Agents must not silently begin later phases.

---

# 2. Product Direction

AP SiteCare is a dashboard-first operations platform for Adriel Partners'
managed WordPress service.

The Dashboard owns:

- client and site records
- authentication and authorization
- service plans and entitlements
- administrative overrides
- operational history and audit records
- Cloudflare uptime and security visibility
- WordPress update intelligence
- SiteHealth Checkups and SiteHealth Reviews
- long-term SiteCare Pro backups
- reports, email delivery, and notifications
- approved centralized maintenance workflows

The WordPress plugin is a durable site connector. It collects approved local
information and performs only explicitly authorized, narrowly scoped
operations.

Hostinger remains responsible for hosting, routine daily backups, and
Hostinger restoration. Cloudflare remains responsible for security controls
and uptime probes. The SiteCare Dashboard remains responsible for SiteCare
long-term backups, reporting, workflow state, and service entitlements.

---

# 3. Approved Service Plans

Internal plan identifiers and customer-facing labels:

| Identifier | Customer-facing name |
|---|---|
| `sitecare-core` | SiteCare Core |
| `sitecare-plus` | SiteCare Plus |
| `sitecare-pro` | SiteCare Pro |

Entitlement matrix:

| Capability | SiteCare Core | SiteCare Plus | SiteCare Pro |
|---|---|---|---|
| Uptime monitoring | No | No | Yes |
| Normal uptime interval | N/A | N/A | 5 minutes by default; administrator configurable |
| Annual SiteHealth Checkup | No | Once per year | Once per year |
| Hostinger daily backups | Yes | Yes | Yes |
| Hostinger backup retention | 30 days | 30 days | 30 days |
| Dashboard long-term backups | No | No | Yes |
| Long-term backup frequency | N/A | N/A | Monthly |
| Long-term backup contents | N/A | N/A | Full website files and database |
| Long-term backup retention | N/A | N/A | 2 years |
| Long-term destinations | N/A | N/A | One independent off-site destination initially |

Administrative overrides may temporarily alter uptime intervals, alert
thresholds, backup schedules, and service exceptions. Overrides must be
audited and must not rewrite the site's underlying plan.

Plan lifecycle:

- Upgrade: enable new capabilities immediately, schedule the first eligible
  uptime check and long-term backup as soon as practical, and begin annual
  checkup eligibility on the upgrade date.
- Downgrade: remove excluded capabilities at the end of the current billing
  period. Retain existing long-term backups through their original expiration
  dates and create no new excluded backups.
- Cancellation: stop monitoring, checkups, update services, and new backups at
  the end of the paid period. Preserve retained backups through expiration
  unless account deletion is explicitly requested.
- Suspension: pause monitoring, checkups, and new long-term backups without
  deleting history. Resume them on reactivation.

---

# 4. Confirmed Current Baseline

The following capabilities exist today:

- Nuxt 3, Vue 3, TypeScript, and Nitro dashboard
- token-driven dark operations interface and reusable UI primitives
- PostgreSQL migrations, pooled connections, and asynchronous
  repository/service architecture
- managed-site registration, editing, disabling, and credential issuance
- application-owned email/password authentication with server-side sessions
- Admin, Team Member, and Client roles with site-scoped authorization
- client accounts, site ownership, invitations, password recovery, and a safe
  Client Dashboard shell
- immutable SiteCare plan definitions, centralized effective entitlements,
  plan lifecycle history, and audited administrative overrides
- client registry and detail views with ownership, suspension, and plan
  management
- durable authentication email outbox and Brevo delivery worker
- signed WordPress plugin check-ins using per-site HMAC credentials
- basic WordPress, PHP, plugin-update-count, and theme-update-count reporting
- site health projection, audit history, and operational notes
- initial read-only Cloudflare, Dropbox, and Hostinger clients
- Action Request records and inspection-oriented agent APIs
- inspection-and-proposal MCP server
- backup policy, artifact, job, destination, and restore-plan foundations
- separate claim-based backup worker
- Local VPS file/database archive execution and Dropbox upload verification
- plugin-detected backup-source information

Phase 1 verification performed on 2026-07-30:

- `npm test`: 38 PostgreSQL-backed tests passed
- `npm run typecheck`: passed
- `npm run build`: passed
- local, test, and production Compose configuration validation: passed
- dashboard and backup-worker Docker image builds: passed
- live container smoke test with concurrent dashboard and worker PostgreSQL
  connections: passed

The current implementation is a sound prototype foundation, but several
current decisions and structures are superseded by this roadmap.

---

# 5. Confirmed Gaps

The target system still requires:

- a durable scheduler, general job system, and broader transactional outbox
  and idempotency controls beyond authentication email
- additional transactional email providers and per-site notification settings
- durable WordPress connection rotation without routine reauthentication
- detailed core, theme, and plugin inventory and update history
- Hostinger portfolio synchronization based on actually available APIs
- Cloudflare Health Check synchronization and incident workflows
- Cloudflare Security Status checklist
- SiteHealth Checkups and SiteHealth Reviews
- SiteCare Pro monthly long-term backup automation and two-year retention
- configurable storage paths and durable Dropbox OAuth
- supervised portable restore delivery
- centralized manual plugin update rollout
- a client-facing Dashboard
- production migration, security, recovery, and operational runbooks

---

# 6. Superseded or Deferred Scope

The following old assumptions no longer govern future phases:

- Cloudflare Access and Google login will not remain the human Dashboard login.
- The system is no longer permanently observation-only.
- A client-facing Dashboard is now approved.
- Centralized plugin updates are approved for a later controlled phase.
- Long-term backup execution is a SiteCare Pro responsibility.

The following items are excluded or deferred:

- Service Time tracking
- non-Hostinger hosting accounts
- Dashboard management of Hostinger routine backups or restoration
- launch-blocking dependency on Hostinger daily-backup API visibility
- an internal Dashboard uptime probe
- automatic Cloudflare configuration changes
- report generation or email delivery by the WordPress plugin
- automatic SiteHealth cleanup without client approval
- direct SMTP username/password configuration
- Telegram or SMS delivery beyond provider interfaces/stubs
- unsupervised restore execution
- billing and payment processing
- automatic AI execution

---

# 7. Delivery Rules

## Phase Assignment

- The user assigns one phase at a time.
- An agent owns the assigned phase until it reaches its exit criteria or is
  explicitly handed off.
- Agents may complete milestones incrementally, but must not implement
  milestones from a later phase without approval.
- Cross-phase prerequisites must be recorded as blockers, not worked around
  through duplicate architecture.

## Milestone Discipline

Every milestone must:

1. inspect the current implementation and documentation
2. identify affected architectural layers
3. implement a narrow, reviewable change
4. add or update focused tests
5. run proportionate verification
6. update relevant documentation
7. record incomplete work and risks

## Phase Completion and Agent Handoff

The final milestone of every phase is documentation and handoff.

Before a phase may be marked complete, the assigned agent must update this
document with:

- phase status and completion date
- completed milestones
- migrations and new environment variables
- verification commands and results
- important implementation decisions
- known limitations or deferred work
- production or deployment steps still required
- the recommended next phase

The agent must also update, when applicable:

- `AP_SITECARE_ARCHITECTURE.md`
- `AP_SITECARE_DECISIONS.md`
- `AP_SITECARE_PROJECT_RULES.md`
- `AP_SITECARE_VISUAL_IDENTITY.md`
- `README.md`
- operational runbooks

Use this handoff block:

```text
Phase:
Status:
Completed:
Verification:
Schema/configuration changes:
Decisions:
Known limitations:
Deployment notes:
Recommended next assignment:
```

## Status Values

- `not-started`
- `in-progress`
- `blocked`
- `complete`

---

# 8. Roadmap

## Phase 0 — Roadmap and Documentation Reset

Status: `complete`

Completed: 2026-07-30

### Goal

Replace the obsolete Version One roadmap with an implementation sequence based
on the approved SiteCare service model.

### Milestones

#### 0.1 — Current-State Review

- review repository instructions and architecture
- inspect implemented services, repositories, routes, workers, and plugin
- identify conflicts between the current system and approved direction
- verify the current test, type-check, and build baseline

#### 0.2 — Requirements Consolidation

- capture plans and entitlement behavior
- capture authentication and access direction
- capture Cloudflare uptime and security behavior
- capture WordPress and Hostinger boundaries
- capture email, SiteHealth, and backup requirements
- capture removed and deferred features

#### 0.3 — Agent-Handoff Roadmap

- define dependency-ordered phases
- divide phases into milestones
- establish phase completion and documentation requirements
- preserve the original plan as a legacy record

### Exit Criteria

- approved decisions are represented in the active roadmap
- current implementation is distinguished from target behavior
- future phases can be assigned independently

---

## Phase 1 — PostgreSQL and Data Migration Foundation

Status: `complete`

Implementation completed: 2026-07-30

Completion confirmed: 2026-07-31

Gate disposition: the project owner explicitly closed the remaining production
SQLite rehearsal/cutover gate. No deployed legacy database was supplied or
identified. The documented importer remains available if legacy data is later
discovered.

### Goal

Replace SQLite with PostgreSQL before introducing users, concurrent
automation, and higher-volume operational history.

### Dependencies

- Phase 0 complete
- production PostgreSQL hosting approach approved during this phase

### Milestones

#### 1.1 — PostgreSQL Architecture and Migration Design

- inventory all current tables, indexes, constraints, JSON fields, and
  transactional assumptions
- define the PostgreSQL schema and migration mechanism
- choose a lightweight PostgreSQL access layer consistent with repositories
- define local, test, staging, and production database configuration
- define SQLite-to-PostgreSQL data migration and rollback procedures
- document how the dashboard, workers, and MCP process share database access

#### 1.2 — PostgreSQL Repository Compatibility

- introduce the approved PostgreSQL database adapter
- port ordered schema migrations without bypassing repositories
- update repository queries and transaction behavior
- preserve UUID identifiers and UTC timestamps
- add database readiness and migration-state diagnostics

#### 1.3 — Data Migration Tooling

- create a repeatable, idempotent SQLite export/import workflow
- validate record counts, foreign keys, encrypted fields, and JSON payloads
- perform migration rehearsals against copied non-production data
- document rollback and recovery

#### 1.4 — Runtime Cutover

- update dashboard, backup worker, and MCP configuration
- update Docker Compose and environment documentation
- verify concurrent dashboard and worker operation
- prohibit automatic production cutover until a backup and rehearsal succeed

#### 1.5 — Verification and Handoff

- run repository, migration, concurrency, test, type-check, and build checks
- update architecture, decisions, project rules, README, and this roadmap
- record the exact production cutover procedure

### Exit Criteria

- all current tests pass against PostgreSQL
- migrated data is verified
- dashboard, worker, and MCP use PostgreSQL
- SQLite is no longer the active production database
- rollback is documented and rehearsed

### Phase 1 Handoff

Phase: PostgreSQL and Data Migration Foundation

Status: Complete. The project owner explicitly waived the production legacy
data rehearsal/cutover gate on 2026-07-31.

Completed:

- replaced the active SQLite adapter with a pooled PostgreSQL adapter shared
  by the dashboard, worker, and MCP process
- ported all ordered migrations, repositories, services, routes, and tests to
  asynchronous PostgreSQL access
- added PostgreSQL-native JSONB, booleans, TIMESTAMPTZ, BIGINT, advisory
  migration locking, transactions, and `FOR UPDATE SKIP LOCKED` worker claims
- added isolated PostgreSQL test schemas and a dedicated test Compose service
- added a restart-safe SQLite importer with rollback copy, integrity checks,
  type conversion, transactional import, and table/key verification
- updated local and VPS Compose definitions, runtime configuration, worker
  shutdown behavior, architecture, decisions, project rules, README, and
  operations documentation

Verification:

- `npm run typecheck`: passed
- `npm test`: 38 tests passed across 13 suites
- `npm run build`: passed
- `git diff --check`: passed
- local, test, and VPS `docker compose config --quiet`: passed
- dashboard and backup-worker Docker builds: passed
- live dashboard `/api/health`: PostgreSQL connected
- live dashboard and worker connections observed concurrently in
  `pg_stat_activity`
- migration test confirms JSON, boolean, and relationship conversion plus
  safe rerun behavior

Schema/configuration changes:

- `NUXT_DATABASE_PATH` is replaced by `NUXT_DATABASE_URL`
- PostgreSQL 16 is the supported Compose database
- production PostgreSQL is private to `sitecare_internal`
- the durable database volume is `sitecare-postgres-data`
- `TEST_DATABASE_URL` configures the PostgreSQL test target
- `COMPOSE_DATABASE_URL` separates container networking from host development

Decisions:

- retain text identifiers to preserve current UUID strings and the existing
  `runtime-dropbox` destination identifier
- retain `better-sqlite3` only for the one-time importer and its migration
  test, never for runtime persistence
- let application processes run ordered PostgreSQL migrations at startup under
  an advisory transaction lock
- require an empty target or exactly matching primary keys before importer
  reruns; never merge unrelated target data

Known limitations:

- no deployed SQLite database was available in this workspace, so the importer
  was rehearsed against a representative generated legacy database rather
  than a copy of production; the project owner accepted this limitation when
  closing Phase 1
- PostgreSQL infrastructure backup and restore must be configured and tested
  in the deployed environment
- dependency installation continues to report six audit findings (one low,
  four high, one critical); no broad automatic dependency update was applied
  during this database phase
- broader credential and backup workflow transaction boundaries remain
  required before later automation phases

Deployment notes:

- no additional database migration step is required for the currently known
  deployment
- if a legacy SQLite database is later discovered, stop deployment and follow
  `docs/POSTGRESQL_MIGRATION.md` before accepting PostgreSQL writes

Recommended next assignment:

- none for Phase 1; proceed from the active roadmap

---

## Phase 2 — Application Authentication and Role-Based Access

Status: `implementation-complete`

Implementation completed: 2026-07-30

Remaining gate: configure and verify production Brevo delivery, bootstrap the
first production Admin, invite current staff, and remove the second Cloudflare
Access login while retaining edge/origin protection.

### Goal

Replace Cloudflare Access human authentication with durable application-owned
email/password accounts and server-enforced authorization.

### Dependencies

- Phase 1 complete

### Milestones

#### 2.1 — Identity Data Model and Auth Decision

- add users, password credentials, sessions, invitations, password resets,
  authentication events, client accounts, memberships, and site-access
  relationships
- use email address as the login identifier
- hash passwords using an approved password-hashing algorithm
- define 30-day renewable, revocable sessions
- define bootstrap creation of the first Admin without a public registration
  path
- select and document the authentication implementation and dependencies

#### 2.2 — Login and Account Recovery

- implement login, logout, session renewal, and session revocation
- implement invitation acceptance and password reset
- implement the minimum durable Brevo authentication-email slice using the
  same outbox and provider interfaces that Phase 4 will extend; do not create
  a separate ad hoc mail sender
- add rate limiting, generic authentication errors, and login auditing
- add optional MFA foundations
- require Admin MFA before centralized update or restore execution is enabled

#### 2.3 — Authorization Service

- define permissions separately from visual roles
- implement Admin, Team Member, and Client roles
- allow Team Members to access all operational sites by default with optional
  site restrictions
- restrict Clients to their own client account and sites
- enforce authorization in routes and services
- enforce resource scoping in repository queries
- ensure agent and MCP access cannot bypass user or service rules

#### 2.4 — Authentication and User Interface

- create polished login, reset, invitation, profile, and session screens
- add Admin user and membership management
- add role-aware navigation and safe unauthorized states
- create the initial Client Dashboard shell
- preserve Cloudflare proxy, TLS, WAF, rate limiting, and origin protection
  without showing a second Cloudflare login

#### 2.5 — Security Verification and Cutover

- test password storage, session security, CSRF protection, rate limiting,
  horizontal access attempts, role boundaries, and client isolation
- migrate current authorized staff identities
- remove trusted Cloudflare identity headers as the application login boundary
- update architecture, decisions, project rules, deployment, and handoff notes

### Initial Permission Model

| Role | Initial access |
|---|---|
| Admin | Unrestricted application and configuration access |
| Team Member | Operational access to all sites by default, with optional site restrictions; no user-role administration or master credentials by default |
| Client | Read-only access to owned sites, statuses, uptime incidents, update information, backup summaries, and published SiteHealth Reviews |

Clients must never see provider credentials, internal notes, master settings,
internal audit details, or other clients' records.

### Exit Criteria

- email/password login operates without Cloudflare Access login
- invitation and reset flows work
- all protected routes enforce permissions
- cross-client access tests pass
- Admin and Team Member management is usable
- Client accounts can reach only their own empty/safe portal shell

### Phase 2 Handoff

Phase: Application Authentication and Role-Based Access

Status: Implementation complete; production identity/email cutover pending.

Completed:

- added PostgreSQL identity tables for users, password credentials, client
  accounts, memberships, site ownership, restricted Team Member site access,
  sessions, invitations, invitation site access, password resets,
  authentication events, MFA factors, and the email outbox
- implemented normalized email login and salted scrypt password hashing using
  `N=131072`, `r=8`, `p=1`, random salts, constant-time comparison, and a
  12-character minimum
- implemented random server-side 30-day sessions, passive renewal, explicit
  renewal, per-session revocation, account-wide reset revocation, and
  no-store session responses
- implemented Secure/HttpOnly/SameSite session cookies and session-bound
  double-submit CSRF protection for unsafe API requests
- implemented generic login failures, database-backed rate limiting, hashed
  network evidence, and authentication audit events
- added one-time first-Admin CLI bootstrap with no public registration path
- implemented invitation acceptance and password recovery with seven-day and
  one-hour expirations respectively
- added a provider-neutral, idempotent PostgreSQL email outbox, atomic
  `SKIP LOCKED` claims, retry backoff, a Brevo API adapter, and a separate
  email worker
- implemented permission-based Admin, Team Member, and Client authorization
  independently of navigation
- implemented optional Team Member site restrictions and Client isolation
  through client-account site ownership
- added site-scoped repository/service queries for site lists, health,
  dashboard activity, audit history, Action Requests, backup collections and
  backup identifiers, and agent-facing site reads
- added login, forgot/reset password, invitation, profile/session, Admin user
  and membership, client registry/site assignment, and safe Client portal
  screens
- removed Cloudflare trusted identity headers and all human-authentication
  bypasses from the application boundary while preserving the signed plugin
  boundary
- added MFA schema and identity flags; Admin accounts are marked MFA-required
  and high-risk update/restore execution remains unavailable until MFA
  challenge enforcement exists

Verification:

- `npm run typecheck`: passed
- `npm test`: 43 tests passed across 13 suites
- `npm run build`: passed
- local and VPS Compose configuration validation: passed
- Dashboard and email-worker production image builds: passed
- `git diff --check`: passed
- production scrypt hashing, random salts, password verification, session
  revocation, CSRF token validation, login throttling, invitation/reset,
  client/team site isolation, and durable email delivery have focused tests
- live built-server smoke test:
  - `/api/health`: `200`
  - unauthenticated `/api/session`: `401`
  - fabricated Cloudflare identity headers: `401`
  - email/password login and authenticated session: `200`
  - unsafe request without CSRF: `403`
  - unsafe request with session-bound CSRF: `200`
  - logout: `200`; immediate session reuse: `401`

Schema/configuration changes:

- migration 7 adds the application identity, access, MFA-foundation, and email
  outbox schema
- new variables:
  - `NUXT_SITECARE_BASE_URL`
  - `NUXT_AUTH_SECURE_COOKIES`
  - `NUXT_AUTH_EVENT_HASH_KEY`
  - `NUXT_AUTH_SESSION_DAYS`
  - `NUXT_EMAIL_PROVIDER`
  - `NUXT_EMAIL_BREVO_API_KEY`
  - `NUXT_EMAIL_FROM_ADDRESS`
  - `NUXT_EMAIL_FROM_NAME`
  - `NUXT_EMAIL_REPLY_TO`
- the old `NUXT_AUTH_DEVELOPMENT_BYPASS` and
  `NUXT_AUTH_DEVELOPMENT_EMAIL` variables are removed
- local and VPS Compose now include the separate email worker

Decisions:

- use Node's built-in asynchronous scrypt with current OWASP-recommended
  parameters instead of adding a native password dependency
- store only hashes of session, CSRF, invitation, and reset tokens
- use application permissions and resource scope as the server boundary;
  role-aware navigation is convenience, not security
- keep Clients on separate safe APIs rather than attempting to redact internal
  operational API payloads
- use an authentication-email slice of the same provider-neutral outbox Phase
  4 will extend, with Brevo as the launch adapter
- ignore Cloudflare identity assertions; Cloudflare remains an edge security
  and origin-protection service

Known limitations and deployment gates:

- no production administrator or current staff identities were created
  because production credentials and an approved password were not supplied
- Brevo delivery was verified through the provider/outbox contract and worker
  tests, not against a production API key or sender
- MFA persistence and Admin-required flags exist, but enrollment and challenge
  UI are deferred; centralized update and restore execution must remain
  disabled until that challenge is enforced
- the Client portal intentionally exposes only assigned site identity/status;
  uptime, update, backup, and published SiteHealth records arrive in their
  scheduled feature phases
- production must remove any Cloudflare Access policy that creates a second
  login while preserving WAF, proxy, TLS, rate limits, direct-origin blocking,
  and other edge controls
- dependency installation still reports the pre-existing six audit findings
  (one low, four high, one critical); no broad automatic dependency upgrade
  was applied inside the authentication phase

Deployment notes:

- follow `docs/AUTHENTICATION_AND_ACCESS.md`
- configure production authentication/email variables and start the email
  worker
- bootstrap the first Admin exactly once, then invite Team Members from the
  Dashboard
- create clients and assign their sites before sending Client invitations
- test live invitation and reset delivery through Brevo
- complete the Cloudflare Access-to-application-session cutover in one
  controlled maintenance window

Recommended next assignment:

- complete the production authentication cutover checklist, then assign Phase
  3 client registry, plans, and entitlements

---

## Phase 3 — Client Registry, Plans, and Entitlements

Status: `complete` — 2026-07-31

### Goal

Make client ownership and the SiteCare service plan the central source for
feature access and scheduling.

### Dependencies

- Phase 2 complete

### Milestones

#### 3.1 — Client and Site Ownership

- complete the client-account model
- assign every managed site to one client account
- support multiple sites and multiple Client users per account
- create migration and exception handling for existing sites

#### 3.2 — Plans and Entitlement Service

- implement the three immutable plan definitions
- implement a central entitlement service
- ensure interfaces, services, workers, APIs, MCP, and agents consume the same
  entitlement decisions
- separate effective entitlements from underlying plan identity

#### 3.3 — Plan Lifecycle

- implement upgrade, downgrade, cancellation, and suspension effective dates
- support current paid-period end dates without building billing
- schedule newly eligible services as soon as practical
- preserve retained backups through their original expiration
- prevent new work after entitlement termination

#### 3.4 — Administrative Overrides

- support temporary uptime, alert-threshold, backup-schedule, and service
  exceptions
- require reason, actor, start time, and optional expiration
- retain the original plan entitlement
- audit creation, change, expiration, and removal

#### 3.5 — Plan and Client Interface

- build client list/detail views
- add site ownership and plan controls
- display underlying plan, effective entitlements, exceptions, and lifecycle
  dates clearly
- add safe plan-change previews before confirmation

#### 3.6 — Verification and Handoff

- test every plan capability and lifecycle transition
- test downgrade, cancellation, suspension, and override edge cases
- update documentation and this roadmap

### Exit Criteria

- every site has a client and plan
- all entitlement checks use the central service
- plan lifecycle behavior is deterministic and tested
- overrides are temporary, visible, and audited

### Phase 3 Handoff

Phase: Client Registry, Plans, and Entitlements

Status: Complete.

Completed:

- added migration 8 for mandatory client ownership, plan subscriptions,
  lifecycle transitions, entitlement overrides, and service-activation intents
- assigned existing ownerless sites to a visibly marked
  `Unassigned Sites — Review Required` placeholder and assigned SiteCare Core
  to every existing site; the SQLite importer applies the same baseline
- made new site registration transactional across the site record, real client
  ownership, initial plan, initial transition, activation intents, and audit
  history
- implemented immutable SiteCare Core, SiteCare Plus, and SiteCare Pro
  definitions with the approved capability matrix and defaults
- implemented `EntitlementService` as the central evaluator and capability
  guard, separating the underlying plan from current operational status,
  effective capabilities, settings, overrides, and pending changes
- implemented immediate upgrades, paid-period-end downgrades and cancellation,
  pending-change cancellation, client-account suspension, and reactivation
- created activation intents for newly eligible work; the phase that implements
  each capability handler will claim and acknowledge its intent rather than an
  earlier phase pretending the work has already run
- implemented reasoned, timestamped, optional-expiry overrides for service
  exceptions, uptime interval, uptime failure threshold, and long-term backup
  frequency, including conflict prevention and audit history
- gated the existing WordPress update-reporting and long-term backup planning
  and worker paths through the same central entitlement decision
- exposed effective entitlements to Admin APIs, agent inspection APIs, and MCP
  inspection tools
- added Admin client list/detail views, client rename and suspension controls,
  required client/plan selection during site creation, and a Site Detail
  service-plan area with safe preview-before-confirmation lifecycle controls
- preserved historical backup artifacts and restore reads after downgrade,
  cancellation, or suspension while preventing newly excluded backup work

Verification:

- `npm test`: 50 PostgreSQL-backed tests passed across 13 suites
- `npm run typecheck`: passed
- `npm run build`: passed
- `git diff --check`: passed
- focused coverage verifies the immutable matrix, multi-site ownership,
  upgrade, downgrade, cancellation, pending-change cancellation, suspension,
  reactivation, override expiry, audit history, and central execution guards
- desktop and 390-pixel mobile interface review passed for client list/detail,
  site creation, plan preview/change, and override management, with no new
  browser warnings or horizontal overflow

Schema/configuration changes:

- migration 8 adds `client_accounts.is_placeholder`,
  `site_service_subscriptions`, `site_plan_transitions`,
  `site_entitlement_overrides`, and `site_service_activation_intents`
- no new environment variables are required for Phase 3

Operational contracts and limitations:

- only an Admin can use the new client and plan-management APIs; client and
  Team Member resource isolation continues to be enforced server-side
- a site has exactly one current client owner and one underlying plan; the
  placeholder is migration triage only and cannot be selected for new sites
- only one scheduled downgrade or cancellation may exist per site
- due transitions and expired overrides are synchronized whenever the central
  entitlement service evaluates a site; Phase 4 must add proactive scheduled
  synchronization using the same service rules
- activation intents are durable eligibility signals, not proof that an
  integration check or backup has run
- cancellation reactivation is intentionally not inferred; it requires a
  future explicit service-reactivation workflow if needed
- retained artifacts keep their stored expiration dates; Phase 3 does not add
  automatic retention deletion
- the Phase 2 production authentication/database cutover remains a separate
  deployment gate and does not block Phase 4 implementation

Deployment notes:

- run the normal PostgreSQL migrations before deploying the Phase 3 build
- review and reassign every site under the placeholder client before inviting
  a Client user or enabling production automation
- verify the real plan and paid-through date for every production site rather
  than relying on the migration's conservative SiteCare Core default
- use `docs/CLIENTS_PLANS_AND_ENTITLEMENTS.md` for the service and API contract

Recommended next assignment:

- Phase 4 — Durable Automation and Transactional Email

---

## Phase 4 — Durable Automation and Transactional Email

Status: `complete`

### Goal

Create the shared scheduler, jobs, integration synchronization, and
notification infrastructure required by later phases.

### Dependencies

- Phase 3 complete

### Milestones

#### 4.1 — General Job and Scheduler Model

- generalize the existing backup-worker concepts into durable job records
- implement scheduled work claiming, leases, heartbeat, bounded retries,
  backoff, cancellation, and stale-job recovery
- add idempotency keys and per-site operation locks
- separate web requests from long-running work
- retain the existing specialized backup worker where it remains appropriate

#### 4.2 — Workflow State and Audit

- standardize:
  `queued → preflight → running → verifying → succeeded / failed / needs-attention`
- record job inputs, attempts, outputs, timestamps, and responsible actor
- expose job history and safe retry controls
- ensure accepted external requests are not mistaken for completed work

#### 4.3 — Transactional Outbox

- implement durable outgoing-message records
- enqueue messages in the same transaction as the triggering event
- track each recipient independently
- support retries, deduplication, delivery events, bounces, and suppression
- store message metadata and rendered artifact references without retaining
  unnecessary sensitive bodies

#### 4.4 — Email Provider Adapters

- implement a provider-neutral REST API interface
- make Brevo fully operational at launch using an API key
- provide configuration foundations for Mailgun, Postmark, and SendGrid
- do not implement username/password SMTP as the primary path
- add global provider, From, Reply-To, and branding settings
- add per-site recipients and email-category controls

#### 4.5 — Future Notification Interfaces

- define notification contracts that can later support Telegram and SMS
- do not expose non-email channels as operational until implemented

#### 4.6 — Verification and Handoff

- test job idempotency, concurrency, worker interruption, retry, outbox
  durability, multiple recipients, and provider webhook behavior
- update worker runbooks, architecture, decisions, configuration docs, and this
  roadmap

### Exit Criteria

- durable scheduled jobs survive process restarts
- duplicate execution is prevented
- Brevo can send to multiple recipients through the outbox
- delivery and failure status is inspectable
- later phases can register jobs and notifications without inventing new
  worker or email systems

### Phase 4 Handoff

Phase: Durable Automation and Transactional Email

Status: Complete.

Completed:

- added migration 9 with durable schedules, general jobs, attempt history,
  lease-backed per-site/system operation locks, extended recipient-level email
  outbox state, encrypted provider settings, site recipients/categories,
  provider delivery events, and suppressions
- implemented idempotent job queueing, atomic claims, workflow transitions,
  heartbeats, cooperative cancellation, bounded retries and exponential
  backoff, stale-worker recovery, safe payload/output boundaries, and audited
  manual retry/cancellation
- added a general scheduler and automation worker while retaining the verified
  specialized backup worker; the first registered schedule proactively calls
  `EntitlementService` every five minutes for each subscribed site
- expanded the transactional outbox to commit and track each recipient
  independently, recover stale claims, retry provider failures, record provider
  message IDs, and purge rendered bodies after acceptance or terminal failure
- implemented a provider-neutral REST delivery contract with operational Brevo
  sending, encrypted global/provider configuration, and non-operational
  Mailgun, Postmark, and SendGrid foundations
- added a Bearer-authenticated Brevo webhook with event deduplication, delivered
  and bounce status, complaint/block/unsubscribe handling, and a reviewable
  suppression list
- added global provider, From, Reply-To, and branding settings; per-site backup,
  uptime, update, SiteHealth, security, and service recipients/categories; and
  clearly non-operational Telegram/SMS channel stubs
- added the Admin Automation page, job detail/attempt history, retry and cancel
  controls, email configuration/delivery history, suppression controls, and the
  Site Detail Notifications tab
- aligned the backup destination interface's default configurable Dropbox root
  with the approved `/SiteCare Backups` decision

Verification:

- `npm test`: 58 PostgreSQL-backed tests passed across 13 suites
- `npm run typecheck`: passed
- `npm run build`: passed
- focused tests cover idempotency, concurrent operation locking, schedule
  advancement, workflow verification, transient retry, cooperative
  cancellation, stale-worker recovery, recipient fan-out, outbox interruption,
  bounded terminal failure, rendered-body purging, webhook deduplication,
  bounce suppression, and encrypted provider settings
- authenticated desktop and 390-pixel mobile browser review passed for
  Automation, job detail, email settings, and site recipient creation, with no
  console warnings/errors or document-level horizontal overflow

Schema and configuration changes:

- migration 9 adds `automation_schedules`, `automation_jobs`,
  `automation_job_attempts`, `automation_operation_locks`,
  `email_global_settings`, `email_provider_configurations`,
  `site_notification_recipients`, `site_notification_subscriptions`,
  `email_delivery_events`, and `email_suppressions`; it extends `email_outbox`
- new worker settings are `NUXT_AUTOMATION_LEASE_SECONDS`,
  `NUXT_AUTOMATION_HEARTBEAT_SECONDS`,
  `NUXT_AUTOMATION_RETRY_BASE_SECONDS`, and
  `NUXT_AUTOMATION_POLL_SECONDS`
- `NUXT_EMAIL_WEBHOOK_BEARER_TOKEN` secures the Brevo webhook; the Dashboard and
  email worker must share the same durable `NUXT_CREDENTIAL_ENCRYPTION_KEY`
- local and VPS Compose definitions now run independent email and automation
  workers

Decisions:

- added Decision 039 for PostgreSQL lease-backed general automation and the
  recipient-level transactional outbox
- applied Decision 035's `/SiteCare Backups` default in the backup destination
  interface

Known limitations and operational contracts:

- only `entitlements.synchronize` is registered as a general handler; Phase 5
  and later phases must add work to this handler registry rather than creating
  another job system
- a provider-accepted message is `sent`; it becomes `delivered` only from
  provider evidence
- only Brevo can send; Mailgun, Postmark, SendGrid, Telegram, and SMS remain
  configuration/interface foundations
- a real Brevo account was not called during automated verification; provider
  behavior is covered with deterministic doubles and the implementation follows
  Brevo's documented REST and secured-webhook contracts
- schedules are inspectable but not generally editable in the interface
- the production Phase 2 PostgreSQL/authentication cutover remains a separate
  deployment gate and must occur before production Phase 4 workers start

Deployment notes:

- back up production data, complete the Phase 2 cutover, and run migration 9
  before starting either new worker
- configure a durable encryption key, verified Brevo sender, API key, From and
  Reply-To identity, and a long random webhook Bearer token
- start and verify the Dashboard and email worker first, configure the secured
  Brevo webhook, then start the automation worker and inspect successful
  entitlement synchronization in **Automation**
- configure site recipients/categories before later phases begin emitting
  operational notification events
- use `docs/AUTOMATION_AND_NOTIFICATIONS.md` as the worker, API, configuration,
  and extension contract

Recommended next assignment:

- Phase 5 — WordPress Connection, Update Intelligence, and Hostinger Visibility

---

## Phase 5 — WordPress Connection, Update Intelligence, and Hostinger Visibility

Status: `complete — 2026-07-31`

### Goal

Create a permanent, low-maintenance WordPress connection and make the
Dashboard authoritative for update visibility.

### Dependencies

- Phase 4 complete

### Milestones

#### 5.1 — WordPress Connection Lifecycle

- retain per-site HMAC authentication
- implement long-lived connection status and automatic dual-key rotation
- allow an overlap window during rotation
- add recovery, revocation, and reconnect procedures
- avoid routine technician reauthentication
- audit connection and rotation events without exposing secrets

#### 5.2 — Update Inventory Contract

- expand plugin reporting to include installed WordPress core, themes, and
  plugins
- include installed versions, available versions, active state, support or
  abandonment signals where available, and premium-license status when safely
  discoverable
- distinguish update checks from update executions
- validate and version the plugin/Dashboard contract

#### 5.3 — Update Activity History

- record when the update check ran
- record core, theme, and plugin update attempts
- record component identity, prior version, resulting version, timestamps, and
  outcome
- retain failed update details and normalized error information
- reconcile history after manual updates performed in WordPress

#### 5.4 — Hostinger Portfolio Integration

- perform an API capability proof using the actual Agency Cloud Pro account
- map Hostinger sites without making installation ID availability mandatory
- synchronize hosting/site-management links and available metadata
- retrieve routine daily-backup status only when the API provides reliable
  evidence
- display “Not available from Hostinger” without treating absence as failure
- keep Hostinger backup and restore links separate from SiteCare long-term
  backup workflows

#### 5.5 — Dashboard Update Experience

- add portfolio and site-level update views
- show current versions, pending versions, last check, latest successful
  activity, and failures
- add manual refresh and six-hour scheduled synchronization
- provide one-click Hostinger site-management access where available

#### 5.6 — Verification and Handoff

- test contract compatibility, secret rotation, replay resistance, detailed
  update normalization, stale data, and Hostinger degradation
- publish plugin upgrade and compatibility notes
- update architecture, decisions, plugin documentation, and this roadmap

### Exit Criteria

- connected sites do not require routine reauthentication
- Dashboard shows detailed core/theme/plugin state and history
- failed updates are visible
- Hostinger limitations degrade explicitly and safely
- daily-backup visibility is not a launch blocker

### Completion Record

Delivered:

- durable per-site HMAC connections with one-time secret display, automatic
  pending-key delivery, confirmation on first use, a 14-day overlap key,
  explicit revocation/reconnect, exact-request replay rejection, and safe audit
  history
- plugin contract version 2 with detailed WordPress core, plugin, and theme
  inventory; installed and available versions; active and auto-update state;
  support/license signals when safely discoverable; and backward-compatible
  contract version 1 ingestion
- update attempt history with prior/result versions, normalized failure details,
  source-event idempotency, automatic-update capture, and reconciliation after
  updates performed directly in WordPress
- an observation-only, Dashboard-signed WordPress refresh endpoint plus manual
  and six-hour scheduled refresh through the Phase 4 automation worker
- Hostinger portfolio synchronization against the official hosting website and
  WordPress installation resources, with normalized-domain matching that does
  not require an installation ID
- explicit `not-available` daily-backup evidence when Hostinger does not expose
  shared-hosting backup data, separate Hostinger management links, and no
  coupling to SiteCare long-term backups
- portfolio and Site Detail update interfaces, connection lifecycle controls,
  Hostinger status, stale-state presentation, failures, and activity history
- AP SiteCare plugin 0.3.0 packaged at `dist/ap-sitecare-0.3.0.zip`

Verification:

- 61 PostgreSQL-backed application tests pass
- Nuxt type checking and production build pass
- every plugin PHP file passes syntax validation
- the plugin ZIP passes archive-integrity validation
- authenticated desktop and mobile browser review passed for the update
  portfolio and Site Detail update/connection surfaces, with no console errors
  or document-level horizontal overflow

Schema and configuration changes:

- migration 10 extends credential lifecycle state and adds
  `site_plugin_connections`, `plugin_request_signatures`,
  `wordpress_update_snapshots`, `wordpress_update_inventory_items`,
  `wordpress_update_activities`, and `hostinger_site_connections`
- Hostinger uses `NUXT_INTEGRATIONS_HOSTINGER_API_TOKEN` and the official API
  base URL configured by `NUXT_INTEGRATIONS_HOSTINGER_API_BASE_URL`
- the Dashboard and automation worker must share
  `NUXT_CREDENTIAL_ENCRYPTION_KEY` and the Hostinger configuration

Known limitations and operational contracts:

- Hostinger's current public shared-hosting API exposes hosting websites and
  WordPress installations, while its documented backup endpoints are VPS-only;
  daily-backup evidence therefore remains deliberately unavailable rather than
  failed
- a live Agency Cloud Pro account call was not possible without its production
  API token; configure the token and run **Sync Hostinger** as a deployment
  verification step
- WordPress cannot reliably discover every commercial plugin's license state or
  upstream support date; unknown remains explicit and vendors can contribute a
  safe status through the plugin filter contract
- update refresh observes and reports state only; centralized package execution
  remains Phase 11
- the production Phase 2 PostgreSQL/authentication cutover remains a deployment
  gate before production workers run
- the required `MODE_NUXT_APP.md` instruction file referenced by project rules
  is not present in the repository; the existing architecture and coding rules
  were followed

Deployment notes:

- complete the Phase 2 production cutover and run migration 10
- deploy Dashboard and automation-worker configuration together, then install
  `dist/ap-sitecare-0.3.0.zip` on connected WordPress sites
- retain the previous site secret during the first successful 0.3.0 check-in;
  the plugin will accept the offered rotation automatically and keep the old
  secret only through the overlap window
- configure the Hostinger API token and run one manual portfolio synchronization
  to capture account-specific capability evidence
- use `docs/WORDPRESS_UPDATE_INTELLIGENCE.md` as the connection, contract,
  worker, API, and upgrade handoff

Recommended next assignment:

- Phase 6 — Cloudflare Uptime and Security Status

---

## Phase 6 — Cloudflare Uptime and Security Status

Status: `complete — 2026-07-31`

### Goal

Use Cloudflare as the uptime and security source of truth while the Dashboard
owns entitlements, incidents, status presentation, and notifications.

### Dependencies

- Phase 4 complete
- Phase 3 entitlement service complete

### Milestones

#### 6.1 — Cloudflare Capability Proof and Connection

- validate Health Checks, Notifications/webhooks, DNS, zone settings, DNSSEC,
  SSL, Bot Management, and Rulesets access against the actual Cloudflare
  account and plans
- create least-privilege long-lived API token guidance
- map each managed site to its Cloudflare zone and homepage
- document unavailable or plan-dependent API fields

#### 6.2 — Uptime Monitor Provisioning

- enable uptime only for SiteCare Pro unless a logged exception applies
- use a 5-minute normal interval by default
- support administrator interval and threshold overrides
- after the first failed check, move the affected site to 60-second checking
  when Cloudflare capabilities permit
- alert after the second consecutive failure
- return immediately to the normal interval after recovery
- follow redirects and treat a final successful 2xx page as up
- treat dead-end redirects as down
- probe the homepage only

#### 6.3 — Incident and Recovery Workflow

- do not retain isolated one-minute transient failure state as an incident
- record confirmed incident start, failure history, recovery time, and duration
- retain raw monitoring history for 60 days with rolling deletion
- retain incident summaries longer according to the approved data policy
- exclude known maintenance windows when Cloudflare supplies or the Dashboard
  records them
- send recovery reports with timestamps, total downtime, technician notes, and
  restored-backup reference when applicable
- send TLS/certificate errors separately and do not count them as downtime

#### 6.4 — Uptime Notifications

- send email only through the Dashboard notification service
- support multiple per-site recipients
- send no customer alert for the first failed check
- provide future Telegram and SMS adapter hooks without enabling them

#### 6.5 — Security Status Checklist

- add a dedicated Security Status area to Site Detail
- synchronize approved Cloudflare controls
- use `Active` in green and `Inactive` in red
- use `Pending` in yellow only where Cloudflare reports a meaningful
  transitional state
- allow technicians to mark API-inaccessible controls Active or Inactive with
  actor, timestamp, source, and notes
- keep the feature read-only; do not change Cloudflare settings

Approved checklist:

- Cloudflare proxy and Global CDN for relevant web records
- Automatic HTTPS Rewrites
- Always Use HTTPS
- Opportunistic Encryption
- Cloudflare-managed compression
- HTTP/3
- Automatic Platform Optimization when applicable
- Browser Integrity Check
- Bot Fight Mode
- WAF with Cloudflare Managed Rules
- Cloudflare-managed DDoS protection
- DNSSEC where supported
- Universal SSL
- standard caching without a site-wide bypass
- Security Level Medium

Auto Minify is omitted because Cloudflare deprecated it. Higher-than-Medium
security settings should be marked for review rather than automatically
treated as broken.

#### 6.6 — Verification and Handoff

- test entitlement changes, failure/recovery sequences, redirect behavior,
  TLS separation, missed webhook reconciliation, retention cleanup, manual
  security evidence, and permission boundaries
- update Cloudflare runbooks, architecture, decisions, and this roadmap

### Exit Criteria

- Cloudflare performs all uptime probes
- SiteCare Pro incidents and recovery notifications are reliable
- raw history rolls off after 60 days
- security controls form a usable read-only technician checklist
- unavailable API fields can be represented by audited technician findings

### Completion Record

Delivered:

- least-privilege Cloudflare configuration guidance, durable per-site zone
  mapping, API capability evidence, and notification-destination readiness
- SiteCare Pro entitlement-aware Health Check provisioning with a configurable
  five-minute normal interval, 60-second confirmation interval, and immediate
  restoration of the normal interval after recovery
- Cloudflare-owned probing with webhook ingestion plus 60-second API
  reconciliation, provider-event idempotency, redirect following, final-2xx
  success requirements, and strict TLS validation
- transient first-failure state that is discarded on recovery, confirmed
  incidents after a second distinct failure, durable failure history, recovery
  timestamps and duration, maintenance exclusions, and rolling 60-day raw
  observation retention
- separate TLS/certificate events that do not open downtime incidents
- Dashboard-owned incident and recovery email through the Phase 4 transactional
  outbox, including multiple per-site recipients, technician notes, restored
  backup references, and updated recovery-report delivery
- a read-only Security Status checklist covering the approved Cloudflare
  controls, plan-aware unavailable states, and audited technician evidence that
  can override API-inaccessible controls
- Site Detail Uptime and Security Status interfaces plus a portfolio Security
  view and Cloudflare-backed Dashboard summary state

Verification:

- 69 PostgreSQL-backed application tests pass, including entitlement changes,
  first/second failure behavior, missed-webhook reconciliation, recovery,
  redirect configuration, TLS separation, maintenance exclusions, retention,
  webhook idempotency, technician evidence, and webhook-secret comparison
- Nuxt type checking and production build pass
- authenticated desktop and mobile browser review passed for Site Detail
  Uptime, Site Detail Security Status, and the portfolio Security view, with no
  console errors or document-level horizontal overflow

Schema and configuration changes:

- migration 11 adds Cloudflare connections, monitor state, incidents,
  observations, TLS alerts, maintenance windows, security synchronizations, and
  technician/API security evidence
- Dashboard and automation worker configuration now accepts the Cloudflare API
  token, API base URL, account identifier, notification destination and policy
  identifiers, and webhook authentication secret
- every managed site receives scheduled Cloudflare reconciliation and security
  synchronization work; the entitlement service remains authoritative for
  whether uptime monitoring is active

Known limitations and operational contracts:

- live API capability proof remains a deployment gate because the Agency
  Cloudflare token and account identifiers were not available in this workspace
- notification destinations and policies are validated through the API but are
  intentionally not created or mutated by SiteCare; create them in Cloudflare
  and provide their identifiers to both runtime services
- some security controls are plan-dependent or not exposed by the API; those
  remain explicitly unavailable until a technician records audited evidence
- security synchronization is status-only and never changes Cloudflare settings
- the production Phase 2 PostgreSQL/authentication cutover remains a deployment
  gate before production workers run

Deployment notes:

- complete the Phase 2 production cutover, back up PostgreSQL, and run migration
  11 before enabling Phase 6 workers
- create a least-privilege Cloudflare API token, configure the account and
  notification identifiers, and share the same webhook secret with the
  Dashboard and Cloudflare notification destination
- point the Cloudflare Health Check notification webhook at
  `https://sitecare.adrielpartners.com/api/webhooks/cloudflare/health-check`
  and enable the Health Check status notification policy
- deploy the Dashboard, automation worker, and email worker together; then use
  one SiteCare Pro site to verify provisioning, a controlled two-failure
  incident, recovery, and email delivery
- use `docs/CLOUDFLARE_UPTIME_AND_SECURITY.md` as the capability, configuration,
  worker, webhook, API, and operations handoff

Recommended next assignment:

- Phase 7 — SiteCare Pro Long-Term Backups

---

## Phase 7 — SiteCare Pro Long-Term Backups

Status: `implementation-complete — 2026-07-31`; production Hostinger source,
Dropbox OAuth, and supervised-restore proofs remain deployment acceptance gates.

### Goal

Convert the current backup prototype into the approved monthly, portable,
off-site backup service for SiteCare Pro.

### Dependencies

- Phase 3 entitlements complete
- Phase 4 jobs and notifications complete
- Phase 5 Hostinger/WordPress connection findings available

### Milestones

#### 7.1 — Existing Backup Foundation Reconciliation

- compare current Local VPS assumptions with Hostinger shared Cloud Pro access
- validate SSH/SFTP/database access using the real hosting environment
- remove or quarantine unsupported source paths
- make credential setup, validation, and rotation transactional
- stop sending WordPress database passwords when a safer approved source
  connection replaces that behavior

#### 7.2 — Pro Backup Policy

- enforce monthly full files-and-database backups for SiteCare Pro
- enforce two-year retention
- enforce one effective independent off-site destination initially
- schedule the first backup after upgrade as soon as practical
- stop new backups after downgrade/cancellation effective date
- pause on suspension without deleting history
- preserve existing backups through original expiration

#### 7.3 — Portable Backup Package

- create standard archives that can be restored to WordPress-compatible
  hosting without proprietary tooling
- avoid volume splitting, deltas, or proprietary formats
- include full website files, compressed SQL, manifest, checksums, and a
  concise restoration README
- verify archive integrity before counting a backup as successful
- retain failed attempts and normalized errors

#### 7.4 — Storage Destinations and Paths

- make Dropbox the first operational destination
- implement durable OAuth refresh-token authorization
- validate long-lived refresh and revocation behavior
- default the configurable root to `/SiteCare Backups`
- support configurable root/prefix paths for every destination adapter
- store objects under:
  `SiteCare Backups/Client Name/YYYY/MM/{backup-id}`
- include the canonical website hostname, timestamp, and backup ID in artifact
  filenames
- preserve exact stored paths on existing records when settings change
- keep client folder identity stable when client display names change

#### 7.5 — Backup Status and Email

- show latest successful SiteCare backup and recent failed attempts
- keep Hostinger daily-backup information visually separate
- send configurable backup success/failure emails through the Dashboard
- support multiple recipients
- expose verification evidence and retention dates

#### 7.6 — Supervised Restore Delivery

- implement restore preflight, artifact selection, verification, download, and
  technician checklist
- record recovery notes, timestamps, and selected backup
- verify restoration onto a clean WordPress-compatible hosting account
- do not enable unattended restore execution
- provide Hostinger restoration only as a separate external link when useful

#### 7.7 — Retention and Recovery Verification

- implement safe scheduled expiration
- use dry-run and audit evidence before deletion is enabled
- test interrupted uploads, partial destination failure, retry,
  deduplication, checksum failure, OAuth refresh, and expiration
- update backup operations documents, architecture, decisions, and this
  roadmap

### Exit Criteria

- eligible Pro sites receive verified monthly portable backups
- retention and entitlement transitions work correctly
- Dropbox does not require routine technician reauthentication
- backup filenames and folders follow the approved structure
- a supervised restore has been proven on compatible hosting

### Completion Record

Delivered:

- migration 12 for Pro policy state, transactional SSH/SFTP credentials,
  stable client folders, portable backup objects, OAuth state, retention dry
  runs, and supervised restore evidence
- a daily automation evaluation that queues one idempotent full monthly backup
  for entitled Pro sites, immediately evaluates newly created schedules, and
  rechecks entitlements before execution
- 24-month artifact expiration, preservation across plan lifecycle changes,
  one effective off-site destination, and audited retention dry runs with
  remote deletion deliberately disabled pending acceptance
- a Hostinger shared-hosting SSH/SFTP adapter using SSH-key authentication,
  learned/pinned host keys, recursive file download, and fixed WP-CLI database
  export; legacy Local VPS paths are marked quarantined in migration 12
- transactional policy/connection saves, atomic artifact/job/destination
  creation, atomic completion/failure finalization, worker leases, partial
  upload evidence, retries as new artifacts, and normalized secret-safe errors
- portable packages containing hostname/timestamp/backup-ID filenames, full
  website files, compressed SQL, manifest v2, SHA-256 checksums, and
  `RESTORE.md`; tar, gzip, and checksum integrity are verified before success
- Dropbox access-token compatibility plus offline OAuth authorization and
  automatic refresh-token renewal, with `/SiteCare Backups` as the default
  configurable root and stable `Client Name/YYYY/MM/{backup-id}` paths
- exact per-object storage paths and checksums so changing a destination root
  affects only new backups and existing retained artifacts remain downloadable
- separate Hostinger daily-backup evidence and SiteCare long-term-backup status,
  latest success, recent failures, retention dates, and per-site backup-category
  success/failure email fan-out through the transactional outbox
- supervised restore preflight, four-hour Dropbox download links, technician
  checklist, target host, notes, timestamps, outcome, and audit evidence; no
  unattended restore execution exists
- outbound-only worker network access for Dropbox, Brevo, Cloudflare,
  Hostinger, and SSH/SFTP without exposing worker ports

Verification:

- 72 PostgreSQL-backed application tests pass
- Nuxt type checking passes
- production Nuxt build passes
- focused tests cover monthly deduplication, 24-month retention, stable Dropbox
  paths with spaces, OAuth token refresh, package contents, secret redaction,
  worker contention, stale recovery, database-only transition behavior, and
  retention dry runs

Production acceptance gates:

- completed 2026-07-31: configured the App Folder-scoped production Dropbox
  app, exact callback URI, and required scopes; stored the app secret only in
  deployment secrets; connected an encrypted Dashboard OAuth refresh token;
  verified metadata-read, content-write, and automatic refresh-token exchange;
  and deployed `/` app-folder-root support so paths begin directly with the
  stable client folder inside `Dropbox/Apps/SiteCare Backups`
- enable Hostinger Remote Access for one Pro site, add a SiteCare SSH public
  key, configure its host/user/root, and prove the read boundary plus WP-CLI
  database export on the actual Agency Cloud Pro account
- execute one full backup, interrupt/retry a controlled upload, verify all
  Dropbox objects, and complete a supervised restore onto a clean compatible
  WordPress host before declaring the live service accepted
- approve a separate retention-deletion change only after reviewing at least
  one production dry-run; Phase 7 does not delete Dropbox objects automatically

Known limitations:

- Hostinger's public API does not provide a shared-hosting full-file export;
  SSH/SFTP is therefore the implemented source, and its account-specific read
  boundary must be proven live
- WP-CLI availability is required for password-free database export; if the
  live Agency environment does not expose it, retain the encrypted transitional
  database credential path until a safer fixed alternative is approved
- Google Drive and S3-compatible records remain non-executable future adapters
- the required `MODE_NUXT_APP.md` instruction file referenced by project rules
  is still absent; the architecture and coding rules were followed

Deployment notes:

- deploy migration 12, Dashboard, automation worker, backup worker, and email
  worker together
- configure the new Dropbox OAuth variables documented in `.env.example`; the
  existing access-token path remains backward compatible during cutover
- use `docs/BACKUP_DESTINATIONS.md` and `BACKUP_WORKER_OPERATIONS.md` as the
  storage, Hostinger source, worker, recovery, and acceptance handoff

Recommended next assignment:

- complete the three production acceptance proofs above, then begin Phase 8 —
  SiteHealth Checkups and SiteHealth Reviews

---

## Phase 8 — SiteHealth Checkups and SiteHealth Reviews

Status: `not-started`

### Goal

Automate collection and report assembly while preserving technician review and
client approval before cleanup.

### Dependencies

- Phase 3 entitlements complete
- Phase 4 jobs and email complete
- Phase 5 WordPress inventory complete
- Phase 6 Cloudflare security data available where relevant

### Milestones

#### 8.1 — Checkup Lifecycle

- define SiteHealth Checkup runs and SiteHealth Review artifacts
- allow an Admin or Team Member to run a Checkup manually for any site,
  regardless of plan
- automate one annual Checkup for Plus and Pro
- make the first automated Checkup due within 30 days of eligibility
- schedule later annual eligibility from the prior completed Checkup
- prevent duplicate annual runs

#### 8.2 — Automated Collection

- collect desktop and mobile PageSpeed and Core Web Vitals
- identify potentially outdated, unnecessary, or consolidatable pages
- make broken-link analysis optional
- analyze large, unused, and conversion/compression-candidate media
- review inactive users, old administrators, and permissions
- review unused themes/plugins, abandonment/support signals, and premium
  license status
- report WordPress version, PHP version, storage usage, and SSL
- report database size, revisions, transients, and general health
- mark unavailable evidence clearly without inventing findings

#### 8.3 — Draft Review Generation

- assemble collected evidence in the Dashboard
- generate a draft SiteHealth Review
- allow technicians to edit findings, add manual findings, override automated
  conclusions, and create recommendations
- ensure technician findings supersede automated results while preserving the
  original evidence
- version published reviews

#### 8.4 — Client Delivery and Approval

- generate and email the final Review from the Dashboard
- use per-site recipients and multiple-recipient delivery
- instruct the client to email Adriel Partners to approve all recommendations
- allow a technician to record the external approval
- do not interpret email replies automatically during this phase

#### 8.5 — Cleanup Proposal Boundary

- represent approved cleanup recommendations without automatically executing
  them
- support removal proposals for unused plugins, themes, and user accounts
- support database optimization, revision/transient cleanup, image
  compression, orphaned-media review, backup verification, and update
  verification
- require explicit client approval and technician initiation
- do not track Service Time

#### 8.6 — Verification and Handoff

- test manual and automated eligibility, duplicate prevention, evidence
  provenance, technician overrides, report versioning, recipient delivery, and
  client data isolation
- update terminology, report templates, architecture, decisions, and this
  roadmap

### Exit Criteria

- any site can receive a manual Checkup
- Plus and Pro scheduling is automatic
- Reviews are generated and emailed only from the Dashboard
- technicians can review and revise all recommendations
- no cleanup occurs without separately recorded approval

---

## Phase 9 — Centralized Manual Plugin Updates

Status: `not-started`

### Goal

Allow an Admin to upload a commercial or manually distributed plugin package
once and safely roll it out to selected connected sites.

### Dependencies

- Phase 2 Admin authorization and MFA complete
- Phase 4 durable jobs complete
- Phase 5 detailed update inventory and durable WordPress connection complete
- Phase 7 backup/preflight patterns available, with plan-appropriate recovery
  evidence for sites that are not entitled to SiteCare long-term backups

### Milestones

#### 9.1 — Package Intake

- accept WordPress plugin ZIP uploads from Admins only
- enforce size, archive safety, file-type, structure, slug, and version
  validation
- scan or quarantine packages before use
- calculate immutable package checksum and provenance
- prevent executable access to stored uploads

#### 9.2 — Target Discovery and Selection

- match the uploaded plugin slug/version to installed inventories
- automatically select sites where the plugin is installed and behind the
  uploaded version
- allow explicit deselection
- show incompatible, unavailable, disconnected, suspended, and already-current
  sites separately
- show recovery readiness using a verified SiteCare backup for eligible Pro
  sites or technician-confirmed Hostinger backup evidence for Core and Plus;
  do not make the Dashboard create or restore Hostinger backups
- provide a dry-run/preflight result for every target

#### 9.3 — Approval and Staged Rollout

- create an auditable Action Request and rollout record
- require explicit Admin confirmation
- support a canary batch before broader rollout
- use per-site locks and bounded concurrency
- stop or pause subsequent batches when the failure threshold is reached

#### 9.4 — WordPress Update Execution

- add a narrow signed plugin endpoint for the approved package operation
- verify package identity and authorization on the site
- record before version, attempted version, resulting version, timestamps, and
  outcome
- verify the site responds successfully after update
- retain normalized failure evidence
- provide a tested rollback strategy or mark rollback as requiring technician
  intervention

#### 9.5 — Results and Handoff

- display per-site and rollout-wide status
- support safe retries only for failed targets
- send configured completion/failure emails
- test compromised requests, replay, partial failure, duplicate delivery,
  package mismatch, canary halt, and recovery
- update action, plugin, security, architecture, decision, and roadmap docs

### Exit Criteria

- Admins can upload once and target eligible sites
- auto-selection is based on verified installed versions
- every site result is auditable
- failed batches stop safely
- no Team Member, Client, agent, or MCP tool can bypass the approval boundary

---

## Phase 10 — Complete Client Dashboard Experience

Status: `not-started`

### Goal

Turn the Client portal shell into a polished, useful, read-only account
experience.

### Dependencies

- Phase 2 Client isolation complete
- relevant operational phases provide real data

### Milestones

#### 10.1 — Client Information Architecture

- define client-safe navigation and terminology
- present only owned sites
- prioritize reassurance, current status, recent work, and actionable contact
  paths
- keep internal operational complexity out of the client experience

#### 10.2 — Client Site Overview

- display uptime and incident summaries when entitled
- display WordPress update status and recent update activity
- display Hostinger and SiteCare backup summaries separately
- display published SiteHealth Reviews
- display plan name and included services
- mark unavailable evidence honestly

#### 10.3 — Reports and Communication

- provide secure report viewing and downloads
- display relevant notification preferences and recipients as permitted
- provide a clear “email us” path for Checkup recommendations and support
- do not expose internal notes, credentials, raw provider payloads, or internal
  audit records

#### 10.4 — Accessibility, Responsiveness, and Isolation Review

- verify desktop, tablet, and mobile layouts
- verify keyboard and screen-reader essentials
- verify empty, loading, error, stale, suspended, and cancelled states
- perform comprehensive cross-client authorization tests
- update visual identity, architecture, and this roadmap

### Exit Criteria

- Clients can understand the health and care status of their own sites
- no internal or cross-client information is exposed
- client-visible data comes from the same services as internal APIs
- the portal is usable across supported devices

---

## Phase 11 — Production Hardening and Operational Launch

Status: `not-started`

### Goal

Prepare the expanded system for dependable production operation and future
agent handoffs.

### Dependencies

- required product phases complete
- user selects the capabilities included in the first production release

### Milestones

#### 11.1 — Security Review

- review authentication, authorization, sessions, MFA, secrets, uploads,
  webhooks, HMAC rotation, and audit coverage
- verify origin restrictions and Cloudflare protections
- review data minimization and client separation
- perform dependency and configuration review

#### 11.2 — Reliability and Recovery

- test worker restart, scheduler downtime, external API failure, outbox
  recovery, and webhook replay
- document PostgreSQL backup and restore
- document encryption-key backup and rotation
- rehearse Dashboard disaster recovery
- rehearse a SiteCare backup restoration

#### 11.3 — Observability and Operations

- add structured logging and operational health views
- expose failed/stuck jobs and integration degradation
- define alerting for the Dashboard, workers, database, and email delivery
- document routine technician and administrator procedures

#### 11.4 — Data Migration and Production Cutover

- back up the production database and configuration
- rehearse all migrations
- define maintenance window and rollback
- migrate existing sites, credentials, backup records, and staff identities
- validate record counts and critical workflows after cutover

#### 11.5 — Final Product Verification

- run the full automated suite
- perform end-to-end Admin, Team Member, and Client workflows
- verify plan transitions and entitlements
- verify WordPress, Hostinger, Cloudflare, Dropbox, and Brevo integrations
- verify accessibility and responsive behavior
- document accepted limitations

#### 11.6 — Final Handoff

- update all durable documentation to current production facts
- remove obsolete placeholders and misleading completion claims
- create a production operations checklist
- record version, deployment date, migrations, and rollback point
- identify the next approved roadmap rather than implementing it

### Exit Criteria

- selected release scope is production-ready
- recovery procedures are proven
- security and client isolation checks pass
- operations are documented for another human or AI agent
- current status and next work are unambiguous

---

# 9. Cross-Cutting Requirements

These requirements apply to every phase:

- UI → API Route → Service → Repository → PostgreSQL
- WordPress Hook → Controller → Service → Repository
- no business logic in pages or route handlers
- no external provider calls directly from pages
- no credentials in source control, logs, audit metadata, or client responses
- server-side authorization for every protected operation
- idempotency for retryable external effects
- per-site locking for conflicting operational work
- explicit source, timestamp, freshness, and availability for provider data
- manual technician findings may supersede automation but must remain audited
- all important operations produce inspectable history
- unavailable external data must not be represented as success or failure
- heavy work runs in workers
- reports and emails are generated by the Dashboard
- the plugin remains narrowly scoped
- agents and MCP consume application services and cannot bypass approvals
- visual changes use the existing token and primitive system
- every schema change uses a repository migration
- every phase updates documentation before handoff

---

# 10. Roadmap Completion Definition

The roadmap is successful when:

- Adriel Partners can manage clients and SiteCare plans centrally
- Admins, Team Members, and Clients have appropriate durable access
- sites remain connected without routine reauthentication
- WordPress update status and history are visible across the portfolio
- Cloudflare provides reliable Pro uptime checks and security-status evidence
- Plus and Pro SiteHealth Reviews are automated and technician-reviewed
- Pro long-term backups are portable, verified, retained for two years, and
  recoverable
- transactional email is reliable and configurable
- approved manual plugin packages can be deployed centrally and safely
- all critical state is auditable
- the platform can be operated and extended by alternating human and AI agents
  without reconstructing prior decisions
