# Clients, Plans, and Entitlements

Status: Phase 3 complete on 2026-07-31.

This document is the durable operating and implementation contract for client
ownership, SiteCare plans, lifecycle transitions, and administrative
overrides.

## Core Invariants

- Every site belongs to one client account.
- Every site has one underlying plan: `sitecare-core`, `sitecare-plus`, or
  `sitecare-pro`.
- Plan definitions are immutable application definitions.
- Effective entitlements are calculated only by `EntitlementService`.
- A plan change or override never erases lifecycle or audit history.
- Retained backup artifacts remain available through their stored expiration
  dates even when new backup work becomes ineligible.

## Existing-Site Migration

PostgreSQL migration 8 assigns SiteCare Core to every existing site. A site
without an owner is assigned to the visibly marked
`Unassigned Sites — Review Required` placeholder.

Before production automation:

1. Open Clients and locate the placeholder account if it exists.
2. Reassign each site to its real client.
3. Open each site's Service Plan tab.
4. Confirm its actual plan and paid-through date.
5. Apply upgrades immediately or schedule downgrades/cancellation at the real
   billing-period end.

The placeholder cannot be used when registering a new site.

## Lifecycle Behavior

| Action | Effective behavior |
|---|---|
| Upgrade | Applies immediately and records intents for newly eligible work. |
| Downgrade | Remains on the current plan until the selected paid-period end. |
| Cancellation | Stops operational services at the selected paid-period end. |
| Suspension | Immediately pauses operational work for every site in the client account. |
| Reactivation | Restores each site's underlying plan eligibility. |
| Cancel pending change | Cancels the one scheduled downgrade or cancellation with a reason. |

Client suspension does not change the underlying plan. Hostinger's own daily
backup responsibility remains represented even while Dashboard-owned
operational services are paused.

## Administrative Overrides

Supported override types are:

- service capability exception
- uptime interval in minutes
- uptime alert failure threshold
- long-term backup frequency: daily, weekly, or monthly

Every override requires a reason, actor, start time, and value. Expiration is
optional. The service rejects an overlapping override for the same target.
Expired and manually removed overrides remain in history.

## Safe Operator Flow

1. Open a site's Service Plan tab.
2. Select the requested action, target plan where relevant, effective date,
   and reason.
3. Generate the preview.
4. Review immediate versus scheduled timing and gained/lost capabilities.
5. Confirm only if the preview matches the intended service change.

Only Admins can use these controls. Team Member and Client access remains
resource-scoped by server-side permissions.

## Developer Integration

For any new plan-gated operation:

1. Call `EntitlementService.assertCapability(siteId, capability)` before
   accepting or queueing work.
2. Persist accepted work transactionally where the phase requires it.
3. Re-check the capability in the worker immediately before execution.
4. Record completion or failure separately from eligibility.
5. Preserve retained historical artifacts when eligibility ends.

Do not read `plan_id` and recreate the matrix in another service. Agent and MCP
surfaces must consume application services rather than repositories.

## Phase 4 Outcome and Later-Phase Handoff

Phase 4 now runs a five-minute durable entitlement synchronization schedule for
every site subscription. The handler invokes `EntitlementService`, so due plan
transitions, expired overrides, and now-invalid pending intents use the same
rules as request-time evaluation.

Phase 3 activation intents intentionally remain pending until the worker for
their specific capability exists. Phase 5 and later phases must:

- map an eligible pending intent to idempotent uptime, SiteHealth, update
  monitoring, or long-term-backup work only after that feature handler exists
- acknowledge an intent only after scheduling responsibility is durably
  accepted
- re-check the central entitlement immediately before execution
- allow the central service to cancel pending work when eligibility ends

An activation intent is not evidence of a successful provider call, update
check, Checkup, or backup.

The Phase 2 production PostgreSQL/application-authentication cutover remains a
separate deployment task. It must be completed and rehearsed before the Phase
4 workers are released to production.
