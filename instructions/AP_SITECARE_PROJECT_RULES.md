# AP_SITECARE_PROJECT_RULES.md

Version: 2.2
Project: AP SiteCare
Repository: `ap-sitecare`
System Type: Hybrid Internal Operations Platform
Last Updated: 2026-07-31

---

# Purpose

This file defines repository-specific rules for AI agents and developers working on AP SiteCare.

This is not the architecture document.

This file tells agents how to work inside this repo without creating drift, duplicate patterns, security problems, UI inconsistency, or unnecessary complexity.

---

# 1. Repository Role

This repository contains:

- Dashboard application
- WordPress reporter plugin with a limited client visibility layer
- Shared types and contracts
- Documentation

The dashboard is the product.

The plugin is a reporting agent.

Do not reverse this relationship.

---

# 2. Absolute Rules

AI agents must follow these rules:

1. Do not turn AP SiteCare into an unrestricted ManageWP clone.
2. Do not add execution capabilities outside the assigned phase in the active
   implementation plan.
3. Do not add unattended remote restore execution without a separately
   approved phase and proven rollback/recovery procedure.
4. Do not bypass the service layer.
5. Do not place business logic in UI components.
6. Do not access the database directly from pages.
7. Do not bypass repositories.
8. Do not store secrets in source control.
9. Do not build MCP before it is requested.
10. Do not allow agents to directly execute infrastructure actions.

---

# 3. Observation, Approval, and Action Doctrine

AP SiteCare follows:

Observation
→ Proposal / Preflight
→ Approval
→ Controlled Action
→ Verification
→ Audit

The completed legacy Version One stopped at observation and proposal.

The active roadmap may add narrowly scoped action capabilities only in their
assigned phases. Every action requires server-side permission checks,
idempotency, explicit approval where defined, verification, and audit history.
Agents and MCP tools must never bypass these controls.

---

# 4. Dashboard Architecture Rules

Required flow:

UI
→ API Route
→ Service
→ Repository
→ Database

Pages must not:

- query databases
- call external APIs directly
- contain business rules

Components must not:

- access repositories
- access databases
- implement operational logic

---

# 5. Plugin Architecture Rules

Required flow:

WordPress Hook
→ Controller
→ Service
→ Repository

Plugin responsibilities:

- collect site information
- validate local state
- report health information
- render a limited client-facing care summary from local and cached data
- cache a signed, read-only dashboard summary

Plugin must not:

- own operational history
- own site inventory
- become a second dashboard
- make live dashboard API requests while rendering wp-admin pages

---

# 6. API Rules

AP SiteCare is API-first.

Rules:

- UI consumes APIs.
- Future agents consume APIs.
- Future MCP consumes APIs.

Do not create hidden business behavior only available through the UI.

Every major dashboard capability should eventually be available through an API endpoint.

---

# 7. Agent Readiness Rules

Build every major feature assuming future agent usage.

Agents should be able to:

- list sites
- inspect health
- inspect updates
- inspect backups
- review notes
- create action requests

Agents should not bypass application rules.

---

# 8. Action Request Rules

Future actions must be represented as Action Requests.

Examples:

- Update plugins
- Create backup
- Run maintenance
- Verify backups

Actions should be:

- auditable
- reviewable
- traceable

Do not implement direct execution paths that bypass Action Requests.

---

# 9. Security Rules

Dashboard Authentication:

- application-owned email and password
- durable server-side sessions
- Admin, Team Member, and Client authorization

Cloudflare identity headers and local authentication bypasses are not valid
Dashboard login mechanisms.

Plugin Authentication:

- Site ID
- Shared Secret
- HMAC signatures

Expected headers:

X-APSC-Site-ID
X-APSC-Timestamp
X-APSC-Signature

Rules:

- Validate every request.
- Reject unsigned requests.
- Reject stale timestamps.
- Never expose secrets.

---

# 10. Design System Rules

Visual consistency is mandatory.

Required hierarchy:

Design Tokens
→ UI Primitives
→ Feature Components
→ Pages

---

## Tokens

All visual values must originate from tokens.

Examples:

- colors
- spacing
- typography
- borders
- shadows
- radius
- animation timing

Do not hardcode these values throughout the application.

---

## Primitives

Examples:

- AppButton
- AppCard
- AppInput
- AppBadge
- AppTable
- AppPanel

Visual styling belongs in primitives.

---

## Feature Components

Feature components compose primitives.

They should not define their own visual language.

---

## Pages

Pages orchestrate:

- layout
- data loading
- feature composition

Pages should remain thin.

---

# 11. Styling Rules

Avoid:

- random utility classes
- one-off styling
- duplicated visual patterns
- hardcoded colors
- hardcoded spacing values

Prefer:

- tokens
- primitives
- reusable composition

The design system must remain easy to refine without major refactoring.

---

# 12. Dependency Rules

Before adding a dependency:

Confirm:

- platform does not already solve it
- dependency is actively maintained
- dependency improves clarity
- dependency does not reduce portability

Prefer fewer dependencies.

---

# 13. Logging Rules

Important events must be auditable.

Examples:

- site created
- site disabled
- token rotated
- check-in received
- action requested
- action approved
- action executed

Never log:

- secrets
- credentials
- tokens

---

# 14. Documentation Rules

Update documentation when changing:

- architecture
- APIs
- authentication
- integrations
- database ownership
- major workflows
- visual system rules

Update:

- AP_SITECARE_ARCHITECTURE.md
- AP_SITECARE_DECISIONS.md
- AP_SITECARE_PROJECT_RULES.md
- AP_SITECARE_VISUAL_IDENTITY.md
- AP_SITECARE_IMPLEMENTATION_PLAN.md

when appropriate.

---

# 15. Definition of Done

A task is not complete until:

- implementation exists
- architecture boundaries are preserved
- relevant verification is performed
- documentation is updated if required
- visual consistency is maintained
- security implications are considered

Working code alone is not considered done.

---

# 16. Repository Commands

Use these root-level commands:

```text
npm run dev
npm run typecheck
npm run build
docker compose config
docker compose build
```

The repository uses npm workspaces.

Do not add a second package manager.

---

# 17. Authentication Transition Rules

- Application-owned email/password accounts and revocable sessions own human
  authentication.
- Cloudflare human identity headers must not grant application access.
- Authorization must be enforced in routes and services, with repository-level
  client/site scoping.
- Cloudflare may continue to provide proxying, TLS, WAF, rate limiting, and
  origin protection without presenting a second human login.
- Direct production origin access must remain restricted.
- Authentication bypasses are prohibited, including in local development.
- `/api/health`, signed plugin endpoints, login, invitation acceptance, and
  password-recovery endpoints are the only unauthenticated HTTP surfaces.
- Public endpoints must never expose sensitive operational data.

---

# 18. Phase Two Visual Implementation Rules

- Global visual values belong in `apps/dashboard/assets/styles/tokens.css`.
- Global element defaults belong in `apps/dashboard/assets/styles/base.css`.
- Small reusable composition classes belong in
  `apps/dashboard/assets/styles/utilities.css`.
- Reusable UI primitives belong in `apps/dashboard/components/ui`.
- Layout components belong in `apps/dashboard/components/layout`.
- Feature components must compose primitives and must not create a second
  visual language.
- Pages may orchestrate primitives and feature components but should avoid
  owning reusable visual styling.
- Status colors must communicate operational meaning and include text.
- All interactive controls require visible focus, hover, disabled, and loading
  or error states where applicable.
- Desktop and mobile visual review is required for meaningful UI changes.

---

# 19. Phase Three Data Rules

- All schema changes must be implemented as ordered migrations.
- Never edit the production PostgreSQL schema manually.
- Legacy SQLite access is limited to the documented one-time migration tool
  and migration tests.
- Database access belongs in repositories.
- Services own site lifecycle, credential lifecycle, health recording, and
  audit behavior.
- Use UUID strings for domain record identifiers.
- Use ISO 8601 UTC strings for timestamps.
- Normalize frequently queried operational fields into columns.
- Use JSON only for limited metadata and provider payloads.
- Never store or log plaintext site secrets.
- Site secrets require `NUXT_CREDENTIAL_ENCRYPTION_KEY`.
- Only one active credential may exist for a site.
- Sites are disabled rather than deleted through the service layer.
- New meaningful service behavior requires focused tests.

---

# 20. Phase Four Registration Rules

- Site registration pages must use the protected site APIs.
- Site lifecycle behavior belongs in `SiteService`.
- Credential lifecycle behavior belongs in `CredentialService`.
- Site reads must never expose encrypted credential material or raw secrets.
- Raw site secrets may be displayed only in the immediate credential-issuance
  response.
- Connection readiness must be derived from credential and check-in state.
- Disabled sites remain in the inventory and retain their history.

---

# 21. Phase Five Plugin Reporting Rules

- `/api/plugin/*` endpoints bypass human session authentication only because
  they enforce the plugin HMAC boundary.
- `/api/plugin/client-summary` is read-only and may return only client-safe
  care data.
- Plugin signatures bind the ISO 8601 timestamp and exact request body.
- Plugin requests outside the five-minute clock-skew window must be rejected.
- The plugin must use WordPress HTTP, option, cron, capability, nonce,
  sanitization, and escaping APIs.
- Hooks and controllers remain thin; collection and reporting behavior belong
  in services.
- The plugin stores connection settings, local cron state, and the latest
  client-safe dashboard summary cache only.
- The dashboard owns check-in, health, and audit history.
- The plugin must never log or return the Site Secret.
- Plugin admin styles must remain scoped to AP SiteCare screens and its
  WordPress Dashboard widget.
- Unavailable client-facing metrics must display as unknown or unavailable.
- The client-facing view must never imply that unavailable provider activity
  occurred.

---

# 22. Operational Dashboard Rules

- `HealthService` owns health-status calculation.
- Pages and components must display health summaries rather than recreate
  operational rules.
- A check-in older than 24 hours needs attention until a new report arrives.
- A check-in older than 72 hours is critical until a new report arrives.
- Audit reads must flow through `AuditService` and `AuditRepository`.
- Important lifecycle behavior must emit an audit event.
- Operator-maintained hosting, backup, risk, and note fields belong to the
  managed-site inventory.
- Filters, search, and sorting are presentation concerns and must not mutate
  durable site data.

---

# 23. Integration and Agent Rules

- External integration clients remain read-only unless the active roadmap
  explicitly assigns a controlled write capability.
- General read-only integration credentials belong in runtime environment
  variables. Backup-destination credentials are the approved exception: they
  may be entered through protected dashboard APIs and stored only as encrypted
  destination credentials using `NUXT_CREDENTIAL_ENCRYPTION_KEY`.
- Provider clients must return explicit not-configured states when settings
  are absent.
- Action Requests represent proposals and reviews. Execution may be connected
  only in an explicitly assigned action phase with permission, preflight,
  idempotency, verification, and audit controls.
- Agent APIs and MCP tools must call existing services.
- MCP tools must not access repositories or the database directly.
- MCP and agents must not expose execution, update, restore, or
  infrastructure-control tools unless a future phase explicitly approves a
  narrow tool and preserves the same application approval boundary.

---

# 24. Operations Overview Rules

- `DashboardService` owns overview aggregation and pagination.
- Dashboard pages consume the overview API and must not calculate portfolio
  health independently.
- Version One health uses real check-in age and reported update counts.
- Uptime, security, backup freshness, and SSL remain `unknown` until a real
  integration supplies evidence.
- Never display simulated production health or activity.
- Scheduled dashboard tasks are computed planning placeholders only and must
  not imply that a background job executed.
- Quick actions must route to implemented behavior or a safe coming-soon page.
- The operations dashboard uses the approved dark token system. Visual values
  belong in `apps/dashboard/assets/styles/tokens.css`.

---

# 25. Remote Backup Execution Rules

- The dashboard exclusively owns backup policies, schedules, retention intent,
  storage configuration, connection capability, and restore planning.
- The WordPress plugin must not gain backup or restore ownership.
- Backup and restore APIs require dashboard authentication.
- Storage tokens and plaintext database passwords must never be stored in
  policy, artifact, job, restore-plan, audit, or UI records. Database passwords
  may only be stored encrypted in the hosting connection record.
- The WordPress plugin may send database backup credentials only through the
  existing signed HMAC check-in boundary. The dashboard must immediately store
  the password encrypted and must redact it from check-in payload history.
- This database-password reporting behavior is transitional. Roadmap Phase 7
  must retire it when a safer approved Hostinger/SSH source connection replaces
  it.
- Backup-destination credentials may only be stored encrypted in the
  destination registry. Destination APIs and audit events must never return or
  record plaintext credentials.
- Sites inherit the enabled central destination pool unless an explicit
  site-specific override is saved.
- Multiple backup destinations are disabled per site by default and require an
  explicit site-level opt-in.
- Queued jobs must snapshot destination identifiers so later configuration
  changes cannot silently redirect queued backup work.
- Local VPS paths must exist and resolve inside
  `NUXT_BACKUPS_ALLOWED_LOCAL_BASE_DIRECTORIES`.
- Local VPS backup source trees must reject symbolic links before upload.
- Backup execution must run only in the separate backup-worker process.
- Backup commands must use fixed executables and argument arrays without a
  shell or user-provided command strings.
- Workers must claim queued jobs atomically, heartbeat running work, finalize
  stale work as failed, and always clean isolated temporary directories.
- Unimplemented connection and storage adapters must report unsupported and
  must never imply verified capability.
- Manual backup requests only queue work; dashboard requests never execute it.
- Automatic retention deletion is intent only until dry-run cleanup behavior is
  separately approved and verified.
- Restore planning must stop after preflight. No destructive restore,
  confirmation, rollback, shell, or arbitrary filesystem-write route may
  exist in this foundation.
- Every policy change, backup job plan, provider test, verification, and
  restore preflight must emit an audit event.

---

# 26. Active Roadmap and Agent Handoff Rules

- `AP_SITECARE_IMPLEMENTATION_PLAN.md` is the active roadmap.
- `AP_SITECARE_IMPLEMENTATION_PLAN_LEGACY.md` is historical and must not be
  treated as current scope.
- Work begins only when the user assigns a phase.
- Agents must not implement later-phase milestones opportunistically.
- The assigned agent must update the active roadmap at the end of each phase.
- Phase handoff notes must include completed work, verification, schema and
  configuration changes, decisions, limitations, deployment notes, and the
  recommended next assignment.
- Another human or AI agent must be able to continue from the durable
  documentation without reconstructing decisions from chat history.

---

# 27. Client Ownership and Entitlement Rules

- Every site must have exactly one current client owner and one underlying
  SiteCare plan.
- New site creation must use `ClientRegistryService` so the site, ownership,
  initial plan, lifecycle evidence, activation intents, and audit history are
  committed transactionally.
- `Unassigned Sites — Review Required` is a migration-only placeholder. It
  must remain visibly marked, may receive reassigned legacy sites, and must
  never be selectable during new-site registration.
- Plan definitions are immutable code-owned product definitions. Do not create
  editable per-site copies of the entitlement matrix.
- `EntitlementService` exclusively owns effective capability and setting
  decisions. UI, routes, services, workers, agents, MCP, reports, and future
  schedulers must not independently infer entitlement from a plan name.
- Underlying plan identity, subscription status, operational status, and
  effective entitlements are different facts and must remain separate.
- All plan and override mutations require a reason and actor, use a service
  transaction, and emit audit history.
- Upgrades are immediate. Downgrades and cancellation require a future
  paid-period-end effective date. Do not silently replace an existing
  scheduled transition.
- Suspension pauses operational work without changing or deleting underlying
  plan history. Reactivation restores plan-derived eligibility.
- Administrative overrides must have a start time, may have an expiration,
  must not overlap another active override for the same target, and must never
  rewrite the underlying plan.
- New plan-gated work must call `assertCapability` immediately before queueing
  and workers must re-check eligibility immediately before execution.
- Service-activation intents express eligibility for Phase 4 scheduling; they
  are not successful-work records.
- Downgrade, cancellation, and suspension prevent newly excluded work but do
  not delete retained artifacts, reports, incidents, or audit history.
- Temporal synchronization must call the central service and must not duplicate
  lifecycle or override-expiry rules.

---

# 28. Durable Automation and Notification Rules

- Web requests may validate and commit automation work but must not execute
  long-running handlers inline.
- General jobs require stable job type, operation key, idempotency key,
  requesting actor, bounded attempts, and a secret-free size-bounded payload.
- A site/system operation lock must prevent concurrent execution of the same
  operation while permitting unrelated operations to progress.
- Workers must claim atomically, heartbeat leases, respect cooperative
  cancellation, recover stale attempts, use bounded backoff, and release locks
  on every terminal or retry transition.
- Handlers must use `queued -> preflight -> running -> verifying` and must not
  equate provider acceptance with verified completion.
- Every plan-gated handler must re-evaluate `EntitlementService` immediately
  before execution.
- The specialized backup worker remains separate until a later phase assigns
  and verifies a migration onto the general job system.
- Each notification recipient requires an independent outbox row, attempt
  history, delivery status, and idempotency identity.
- Domain events and their required outbox rows must commit in the same
  PostgreSQL transaction.
- Dashboard routes and domain services must never call an email provider
  directly; only the email worker may send committed messages.
- Provider acceptance is `sent`; only provider delivery evidence is
  `delivered`.
- Completed, suppressed, and terminal-failed outbox rows must purge rendered
  bodies while retaining safe metadata and artifact references.
- Provider API keys and webhook tokens must be encrypted, masked, excluded
  from audit metadata, and never returned by an API.
- Provider webhooks must authenticate before parsing domain events, deduplicate
  provider event IDs, and update suppressions for permanent delivery risks.
- Global provider, From, Reply-To, and branding settings are system-level;
  recipients and operational email categories are site-level.
- Brevo is the only operational email adapter in Phase 4. Mailgun, Postmark,
  SendGrid, Telegram, and SMS must remain labeled non-operational until their
  adapters are explicitly assigned and verified.
- Admin job retry, cancellation, provider configuration, and suppression-lift
  actions must produce audit history.

---

# 29. SiteHealth Checkup and Review Rules

- A SiteHealth Checkup collects evidence; a SiteHealth Review is the
  Dashboard-generated, versioned report artifact.
- Manual Checkups are available to authorized staff for every site regardless
  of plan. Automated annual Checkups must resolve Plus/Pro entitlement through
  `EntitlementService` at planning and execution time.
- Checkups must execute as durable automation jobs, never inside a Dashboard
  request.
- The WordPress plugin may collect only bounded, necessary SiteHealth evidence.
  It must not collect user emails, authentication material, content bodies, or
  claim user inactivity without a reliable source.
- Every evidence item must retain provenance and availability. Missing evidence
  must remain unavailable and must never be converted into a successful fact.
- Technician edits must preserve original automated evidence and audit the
  actor and action.
- Published Reviews are immutable versions. The Dashboard alone generates and
  emails them through the transactional outbox and per-site `sitehealth`
  recipients.
- Client Review APIs must strip raw evidence values, technician identities, and
  internal notes, and must enforce client/site ownership.
- External approval must be recorded explicitly. Email replies must not be
  interpreted as approval automatically.
- Approval may create cleanup proposals only. Phase 8 must not contain a
  cleanup executor or Service Time tracking, and technician initiation remains
  a distinct audited step.
