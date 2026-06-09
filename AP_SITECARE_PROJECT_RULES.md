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
- WordPress reporter plugin
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

Plugin must not:

- own operational history
- own site inventory
- become a second dashboard

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
