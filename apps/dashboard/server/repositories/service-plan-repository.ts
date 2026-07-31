import type {
  EntitlementOverride,
  ServiceActivationIntent,
  ServiceCapability,
  SitePlanTransition,
  SiteServiceSubscription
} from '../domain/service-plans'
import { useDatabase, type QueryExecutor } from '../utils/database'

interface SubscriptionRow {
  site_id: string
  plan_id: SiteServiceSubscription['planId']
  status: SiteServiceSubscription['status']
  service_started_at: string
  annual_checkup_eligible_at: string
  paid_through_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

interface TransitionRow {
  id: string
  site_id: string
  transition_type: SitePlanTransition['transitionType']
  from_plan_id: SitePlanTransition['fromPlanId']
  to_plan_id: SitePlanTransition['toPlanId']
  status: SitePlanTransition['status']
  reason: string
  requested_by: string
  requested_at: string
  effective_at: string
  applied_at: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  cancellation_reason: string | null
}

interface OverrideRow {
  id: string
  site_id: string
  override_type: EntitlementOverride['overrideType']
  capability: EntitlementOverride['capability']
  value_json: EntitlementOverride['value']
  reason: string
  starts_at: string
  expires_at: string | null
  created_by: string
  created_at: string
  updated_at: string
  expired_at: string | null
  removed_at: string | null
  removed_by: string | null
  removal_reason: string | null
}

interface ActivationIntentRow {
  id: string
  site_id: string
  capability: ServiceCapability
  source_transition_id: string
  status: ServiceActivationIntent['status']
  eligible_at: string
  created_at: string
  acknowledged_at: string | null
  cancelled_at: string | null
}

function mapSubscription(row: SubscriptionRow): SiteServiceSubscription {
  return {
    siteId: row.site_id,
    planId: row.plan_id,
    status: row.status,
    serviceStartedAt: row.service_started_at,
    annualCheckupEligibleAt: row.annual_checkup_eligible_at,
    paidThroughAt: row.paid_through_at,
    cancelledAt: row.cancelled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapTransition(row: TransitionRow): SitePlanTransition {
  return {
    id: row.id,
    siteId: row.site_id,
    transitionType: row.transition_type,
    fromPlanId: row.from_plan_id,
    toPlanId: row.to_plan_id,
    status: row.status,
    reason: row.reason,
    requestedBy: row.requested_by,
    requestedAt: row.requested_at,
    effectiveAt: row.effective_at,
    appliedAt: row.applied_at,
    cancelledAt: row.cancelled_at,
    cancelledBy: row.cancelled_by,
    cancellationReason: row.cancellation_reason
  }
}

function mapOverride(row: OverrideRow): EntitlementOverride {
  return {
    id: row.id,
    siteId: row.site_id,
    overrideType: row.override_type,
    capability: row.capability,
    value: row.value_json,
    reason: row.reason,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiredAt: row.expired_at,
    removedAt: row.removed_at,
    removedBy: row.removed_by,
    removalReason: row.removal_reason
  }
}

function mapActivationIntent(row: ActivationIntentRow): ServiceActivationIntent {
  return {
    id: row.id,
    siteId: row.site_id,
    capability: row.capability,
    sourceTransitionId: row.source_transition_id,
    status: row.status,
    eligibleAt: row.eligible_at,
    createdAt: row.created_at,
    acknowledgedAt: row.acknowledged_at,
    cancelledAt: row.cancelled_at
  }
}

export class ServicePlanRepository {
  constructor(private readonly database: QueryExecutor = useDatabase()) {}

  async findSiteContext(siteId: string): Promise<{
    siteStatus: 'active' | 'disabled'
    clientAccountId: string
    clientAccountStatus: 'active' | 'suspended'
  } | null> {
    const result = await this.database.query<{
      site_status: 'active' | 'disabled'
      client_account_id: string
      client_account_status: 'active' | 'suspended'
    }>(`
      SELECT
        s.status AS site_status,
        sca.client_account_id,
        ca.status AS client_account_status
      FROM sites s
      JOIN site_client_accounts sca ON sca.site_id = s.id
      JOIN client_accounts ca ON ca.id = sca.client_account_id
      WHERE s.id = $1
    `, [siteId])
    const row = result.rows[0]
    return row ? {
      siteStatus: row.site_status,
      clientAccountId: row.client_account_id,
      clientAccountStatus: row.client_account_status
    } : null
  }

  async findSubscription(siteId: string, forUpdate = false): Promise<SiteServiceSubscription | null> {
    const result = await this.database.query<SubscriptionRow>(
      `SELECT * FROM site_service_subscriptions WHERE site_id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
      [siteId]
    )
    return result.rows[0] ? mapSubscription(result.rows[0]) : null
  }

  async listSubscriptions(siteIds: string[] | null = null): Promise<SiteServiceSubscription[]> {
    const result = siteIds === null
      ? await this.database.query<SubscriptionRow>('SELECT * FROM site_service_subscriptions ORDER BY created_at')
      : siteIds.length === 0
        ? { rows: [] as SubscriptionRow[] }
        : await this.database.query<SubscriptionRow>(`
            SELECT * FROM site_service_subscriptions
            WHERE site_id = ANY($1::text[])
            ORDER BY created_at
          `, [siteIds])
    return result.rows.map(mapSubscription)
  }

  async saveSubscription(subscription: SiteServiceSubscription): Promise<SiteServiceSubscription> {
    await this.database.query(`
      INSERT INTO site_service_subscriptions (
        site_id, plan_id, status, service_started_at,
        annual_checkup_eligible_at, paid_through_at, cancelled_at,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (site_id) DO UPDATE
      SET plan_id = EXCLUDED.plan_id,
          status = EXCLUDED.status,
          service_started_at = EXCLUDED.service_started_at,
          annual_checkup_eligible_at = EXCLUDED.annual_checkup_eligible_at,
          paid_through_at = EXCLUDED.paid_through_at,
          cancelled_at = EXCLUDED.cancelled_at,
          updated_at = EXCLUDED.updated_at
    `, [
      subscription.siteId, subscription.planId, subscription.status,
      subscription.serviceStartedAt, subscription.annualCheckupEligibleAt,
      subscription.paidThroughAt, subscription.cancelledAt,
      subscription.createdAt, subscription.updatedAt
    ])
    return subscription
  }

  async createTransition(transition: SitePlanTransition): Promise<SitePlanTransition> {
    await this.database.query(`
      INSERT INTO site_plan_transitions (
        id, site_id, transition_type, from_plan_id, to_plan_id, status,
        reason, requested_by, requested_at, effective_at, applied_at,
        cancelled_at, cancelled_by, cancellation_reason
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
      transition.id, transition.siteId, transition.transitionType,
      transition.fromPlanId, transition.toPlanId, transition.status,
      transition.reason, transition.requestedBy, transition.requestedAt,
      transition.effectiveAt, transition.appliedAt, transition.cancelledAt,
      transition.cancelledBy, transition.cancellationReason
    ])
    return transition
  }

  async updateTransition(transition: SitePlanTransition): Promise<SitePlanTransition> {
    await this.database.query(`
      UPDATE site_plan_transitions
      SET status = $2, applied_at = $3, cancelled_at = $4,
          cancelled_by = $5, cancellation_reason = $6
      WHERE id = $1
    `, [
      transition.id, transition.status, transition.appliedAt,
      transition.cancelledAt, transition.cancelledBy,
      transition.cancellationReason
    ])
    return transition
  }

  async findPendingTransition(siteId: string, forUpdate = false): Promise<SitePlanTransition | null> {
    const result = await this.database.query<TransitionRow>(`
      SELECT * FROM site_plan_transitions
      WHERE site_id = $1 AND status = 'scheduled'
      ORDER BY requested_at DESC
      LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}
    `, [siteId])
    return result.rows[0] ? mapTransition(result.rows[0]) : null
  }

  async listTransitions(siteId: string): Promise<SitePlanTransition[]> {
    const result = await this.database.query<TransitionRow>(`
      SELECT * FROM site_plan_transitions
      WHERE site_id = $1
      ORDER BY requested_at DESC
    `, [siteId])
    return result.rows.map(mapTransition)
  }

  async createOverride(override: EntitlementOverride): Promise<EntitlementOverride> {
    await this.database.query(`
      INSERT INTO site_entitlement_overrides (
        id, site_id, override_type, capability, value_json, reason,
        starts_at, expires_at, created_by, created_at, updated_at,
        expired_at, removed_at, removed_by, removal_reason
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    `, [
      override.id, override.siteId, override.overrideType, override.capability,
      JSON.stringify(override.value), override.reason, override.startsAt,
      override.expiresAt, override.createdBy, override.createdAt,
      override.updatedAt, override.expiredAt, override.removedAt,
      override.removedBy, override.removalReason
    ])
    return override
  }

  async updateOverride(override: EntitlementOverride): Promise<EntitlementOverride> {
    await this.database.query(`
      UPDATE site_entitlement_overrides
      SET override_type = $2, capability = $3, value_json = $4::jsonb,
          reason = $5, starts_at = $6, expires_at = $7, updated_at = $8,
          expired_at = $9, removed_at = $10, removed_by = $11,
          removal_reason = $12
      WHERE id = $1
    `, [
      override.id, override.overrideType, override.capability,
      JSON.stringify(override.value), override.reason, override.startsAt,
      override.expiresAt, override.updatedAt, override.expiredAt,
      override.removedAt, override.removedBy, override.removalReason
    ])
    return override
  }

  async findOverride(siteId: string, overrideId: string, forUpdate = false): Promise<EntitlementOverride | null> {
    const result = await this.database.query<OverrideRow>(`
      SELECT * FROM site_entitlement_overrides
      WHERE id = $1 AND site_id = $2${forUpdate ? ' FOR UPDATE' : ''}
    `, [overrideId, siteId])
    return result.rows[0] ? mapOverride(result.rows[0]) : null
  }

  async listOverrides(siteId: string): Promise<EntitlementOverride[]> {
    const result = await this.database.query<OverrideRow>(`
      SELECT * FROM site_entitlement_overrides
      WHERE site_id = $1
      ORDER BY created_at DESC
    `, [siteId])
    return result.rows.map(mapOverride)
  }

  async listActiveOverrides(siteId: string, asOf: string): Promise<EntitlementOverride[]> {
    const result = await this.database.query<OverrideRow>(`
      SELECT * FROM site_entitlement_overrides
      WHERE site_id = $1
        AND starts_at <= $2
        AND (expires_at IS NULL OR expires_at > $2)
        AND expired_at IS NULL
        AND removed_at IS NULL
      ORDER BY created_at ASC
    `, [siteId, asOf])
    return result.rows.map(mapOverride)
  }

  async listDueOverrides(siteId: string, asOf: string): Promise<EntitlementOverride[]> {
    const result = await this.database.query<OverrideRow>(`
      SELECT * FROM site_entitlement_overrides
      WHERE site_id = $1
        AND expires_at IS NOT NULL
        AND expires_at <= $2
        AND expired_at IS NULL
        AND removed_at IS NULL
      ORDER BY expires_at ASC
      FOR UPDATE
    `, [siteId, asOf])
    return result.rows.map(mapOverride)
  }

  async createActivationIntent(intent: ServiceActivationIntent): Promise<ServiceActivationIntent> {
    await this.database.query(`
      INSERT INTO site_service_activation_intents (
        id, site_id, capability, source_transition_id, status,
        eligible_at, created_at, acknowledged_at, cancelled_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (site_id, capability, source_transition_id) DO NOTHING
    `, [
      intent.id, intent.siteId, intent.capability, intent.sourceTransitionId,
      intent.status, intent.eligibleAt, intent.createdAt,
      intent.acknowledgedAt, intent.cancelledAt
    ])
    return intent
  }

  async listActivationIntents(siteId: string): Promise<ServiceActivationIntent[]> {
    const result = await this.database.query<ActivationIntentRow>(`
      SELECT * FROM site_service_activation_intents
      WHERE site_id = $1
      ORDER BY created_at DESC
    `, [siteId])
    return result.rows.map(mapActivationIntent)
  }

  async cancelPendingActivationIntents(siteId: string, capabilities: ServiceCapability[], cancelledAt: string): Promise<void> {
    if (capabilities.length === 0) return
    await this.database.query(`
      UPDATE site_service_activation_intents
      SET status = 'cancelled', cancelled_at = $3
      WHERE site_id = $1
        AND capability = ANY($2::text[])
        AND status = 'pending'
    `, [siteId, capabilities, cancelledAt])
  }

  async acknowledgePendingActivationIntents(siteId: string, capabilities: ServiceCapability[], acknowledgedAt: string): Promise<number> {
    if (capabilities.length === 0) return 0
    const result = await this.database.query(`
      UPDATE site_service_activation_intents
      SET status = 'acknowledged', acknowledged_at = $3
      WHERE site_id = $1
        AND capability = ANY($2::text[])
        AND status = 'pending'
        AND eligible_at <= $3
    `, [siteId, capabilities, acknowledgedAt])
    return result.rowCount ?? 0
  }
}
