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

---

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

---

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
