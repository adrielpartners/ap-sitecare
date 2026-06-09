# AP_SITECARE_VISUAL_IDENTITY.md

Version: 1.0
Project: AP SiteCare
Repository: `ap-sitecare`
Last Updated: 2026-06-09

---

# Purpose

This file defines the visual identity and design system direction for AP SiteCare.

Use this document to keep the dashboard beautiful, calm, consistent, and easy to refine over time.

The goal is not to lock the design forever.

The goal is to prevent accidental visual drift.

---

# 1. Visual North Star

AP SiteCare should feel like:

> A calm, premium operations cockpit for website health.

The interface should communicate:

- trust
- clarity
- steadiness
- quiet confidence
- technical competence
- elegance

It should not feel like:

- a cheap SaaS template
- a noisy analytics dashboard
- a WordPress admin clone
- a hosting control panel
- a social media dashboard

---

# 2. Design Principles

## Beautiful by Default

Beauty is a functional requirement.

Every screen should feel intentionally designed.

## Calm Over Flashy

Use restraint.

Avoid unnecessary motion, gradients, decoration, and visual noise.

## Clear Over Dense

Operational dashboards can be information-rich, but they must remain readable.

## Consistent Over Clever

Do not invent a new visual pattern for every feature.

## Refinable Over Rigid

The design must be easy to improve later without refactoring large parts of the app.

---

# 3. Design System Architecture

Required hierarchy:

```text
Design Tokens
→ UI Primitives
→ Feature Components
→ Pages
```

## Design Tokens

Tokens define the visual language.

All major visual decisions must flow through tokens.

Token categories:

- color
- typography
- spacing
- radius
- border
- shadow
- motion
- z-index

## UI Primitives

Primitives own reusable visual behavior.

Examples:

- AppButton
- AppCard
- AppInput
- AppBadge
- AppTable
- AppPanel
- AppDialog
- AppTabs
- AppEmptyState

## Feature Components

Feature components compose primitives.

Examples:

- SiteHealthCard
- SiteStatusBadge
- SiteCheckInTimeline
- SiteBackupSummary
- SiteUpdateSummary
- SiteRiskPanel

## Pages

Pages compose feature components and handle route-level layout.

Pages should not define unique styling systems.

---

# 4. Token Location

Recommended structure:

```text
apps/dashboard/assets/styles/
  tokens.css
  base.css
  utilities.css
```

Alternative structure is acceptable only if documented in `ARCHITECTURE.md`.

---

# 5. Color Philosophy

Color should be semantic, not decorative.

Required semantic colors:

- background
- surface
- surface-muted
- border
- text
- text-muted
- primary
- success
- warning
- danger
- info

Status colors must be consistent everywhere.

## Health States

Use:

- Green for healthy
- Yellow/amber for attention
- Red for urgent or broken
- Blue/neutral for informational
- Gray for inactive or unknown

Do not use status colors for decorative emphasis.

---

# 6. Typography Direction

Typography should feel:

- refined
- readable
- modern
- calm

Requirements:

- define a type scale
- define heading styles
- define body styles
- define small/meta text styles
- define numeric/stat display styles

Avoid:

- oversized marketing headings
- tiny unreadable metadata
- inconsistent font weights
- arbitrary one-off font sizes

---

# 7. Spacing and Density

The dashboard should be efficient but not cramped.

Spacing should communicate hierarchy.

Requirements:

- use a spacing scale
- avoid arbitrary margins and padding
- keep card spacing consistent
- keep tables readable
- optimize for laptop and desktop use
- support mobile inspection when needed

---

# 8. Surfaces

The dashboard will likely use cards, panels, and tables.

Surfaces should feel calm and premium.

Define:

- default surface
- elevated surface
- muted surface
- selected surface
- alert surface

Avoid:

- heavy shadows
- harsh borders
- cluttered card interiors
- excessive nested boxes

---

# 9. Radius, Borders, and Shadows

Use restraint.

Recommended feel:

- soft but not bubbly
- structured but not harsh
- subtle depth

Rules:

- radius values come from tokens
- border values come from tokens
- shadows come from tokens
- no one-off shadow styling

---

# 10. Motion and Interaction

Motion should be minimal and useful.

Use motion for:

- hover feedback
- loading states
- subtle transitions
- drawer/dialog entry

Avoid:

- bouncy animation
- decorative motion
- slow transitions
- distracting effects

---

# 11. Dashboard Layout Direction

The primary dashboard should support fast scanning.

Recommended layout:

- clean top header
- site summary row
- status filters
- responsive site cards or table
- clear empty states
- clear attention states

The main page should help answer:

> What needs my attention?

quickly.

---

# 12. Site Card Direction

A site card should include:

- site name
- URL
- health status
- last check-in
- update count
- backup strategy
- uptime status when available
- quick link to detail view

A card should not become overloaded.

If details grow, move them to the site detail page.

---

# 13. Site Detail Direction

A site detail page may include:

- Overview
- Updates
- Backups
- Security
- Uptime
- Notes
- Audit Log

Version One may implement only Overview.

Future tabs should reuse the same visual system.

---

# 14. Empty States

Empty states should be useful and calm.

Good empty states explain:

- what is missing
- why it matters
- what the next action is

Avoid fake cheerfulness or marketing copy.

---

# 15. Loading and Error States

Loading states should be quiet and clear.

Error states should be specific and actionable.

Do not show raw stack traces or technical internals.

---

# 16. Accessibility Baseline

Requirements:

- adequate contrast
- keyboard navigability
- visible focus states
- semantic HTML
- readable text sizes
- status should not rely on color alone

Status badges should use both color and text.

---

# 17. Light and Dark Mode

Version One may ship with one theme.

However, tokens should be structured so dark mode can be added later without major refactoring.

Do not hardcode light-mode assumptions into components.

---

# 18. What Not To Do

Do not:

- scatter Tailwind utility soup across feature components
- hardcode colors in components
- hardcode spacing in components
- create multiple card styles without reason
- create multiple button systems
- use random icon styles
- build charts before they are needed
- use decorative gradients everywhere
- imitate WordPress admin styling
- imitate generic SaaS dashboard templates

---

# 19. Visual Review Checkpoint

Before building major dashboard screens, create or confirm:

- design tokens
- primitive components
- site card pattern
- status badge pattern
- layout shell
- empty state pattern
- loading state pattern

No major dashboard implementation should proceed before these foundations exist.

---

# 20. Definition of Visually Done

A UI task is not visually done until:

- it uses existing tokens
- it composes existing primitives
- it matches the dashboard visual language
- hover/focus/loading/error states are considered
- it works at expected screen sizes
- it avoids one-off styling
- it remains easy to refine later

Beauty is not polish after the fact.

Beauty is part of the architecture.

---

# 21. Approved Phase Two Foundation

The initial visual foundation was approved on 2026-06-09.

## Initial Theme Direction

- light theme
- warm neutral background and surfaces
- deep ink typography
- muted operational blue primary
- restrained semantic status colors
- subtle borders and shadows
- soft but structured radius
- compact, readable density

## Approved Patterns

- sticky top header
- desktop side navigation
- mobile horizontal navigation
- responsive content area
- site status card
- text-and-color status badge
- operational table
- calm empty state
- quiet loading indicator
- accessible form control

## Responsive Baseline

The foundation is optimized for laptop and desktop operations while remaining
usable for mobile inspection.

The mobile shell:

- hides secondary identity detail
- converts side navigation into a horizontal rail
- stacks status cards
- preserves table access through horizontal scrolling

## Future Theme Work

Dark mode is not part of Version One's current phase.

Semantic token naming must be preserved so dark mode can be added later without
rewriting primitives or feature components.
