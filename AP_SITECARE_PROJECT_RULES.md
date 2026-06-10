# AP_SITECARE_PROJECT_RULES.md

Version: 1.0
Project: AP SiteCare
Repository: `ap-sitecare`
System Type: Hybrid Internal Operations Platform
Last Updated: 2026-06-09

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

1. Do not turn AP SiteCare into a ManageWP clone.
2. Do not add remote update execution in Version One.
3. Do not add remote restore execution in Version One.
4. Do not bypass the service layer.
5. Do not place business logic in UI components.
6. Do not access the database directly from pages.
7. Do not bypass repositories.
8. Do not store secrets in source control.
9. Do not build MCP before it is requested.
10. Do not allow agents to directly execute infrastructure actions.

---

# 3. Observation Before Action Doctrine

AP SiteCare follows:

Observation
→ Proposal
→ Approval
→ Action

Version One stops at Observation.

Future versions may add Proposal.

Action capabilities require explicit approval.

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

- Cloudflare Access
- Google Login

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

- ARCHITECTURE.md
- DECISIONS.md
- PROJECT_RULES.md
- VISUAL_IDENTITY.md
- IMPLEMENTATION_PLAN.md

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

# 17. Phase One Authentication Rules

- Cloudflare Access owns production dashboard authentication.
- Protected requests require the authenticated email and JWT assertion headers.
- Direct production origin access must be restricted.
- The local development bypass must be explicit.
- The local development bypass must never be enabled in production.
- `/api/health` is the only unauthenticated dashboard endpoint in Phase One.
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
- Never edit the production SQLite schema manually.
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

- `/api/plugin/*` endpoints bypass Cloudflare Access only because they enforce
  the plugin HMAC boundary.
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

- External integration clients are read-only in Version One.
- Provider credentials belong only in runtime environment variables.
- Provider clients must return explicit not-configured states when settings
  are absent.
- Action Requests represent proposals and reviews only.
- Approving an Action Request must never execute an external action.
- Agent APIs and MCP tools must call existing services.
- MCP tools must not access repositories or the database directly.
- MCP must not expose execution, update, restore, or infrastructure-control
  tools in Version One.
- Phase 12 requires a separate action specification and explicit approval.

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
