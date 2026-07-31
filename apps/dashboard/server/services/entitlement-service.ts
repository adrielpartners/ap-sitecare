import { randomUUID } from 'node:crypto'
import type {
  BackupScheduleFrequency,
  EffectiveEntitlements,
  EntitlementOverride,
  EntitlementOverrideType,
  ServiceActivationIntent,
  ServiceCapability,
  ServicePlanId,
  SitePlanTransition,
  SiteServiceSubscription
} from '../domain/service-plans'
import {
  isServiceCapability,
  isServicePlanId,
  serviceCapabilities
} from '../domain/service-plans'
import { AuditRepository } from '../repositories/audit-repository'
import { IdentityRepository } from '../repositories/identity-repository'
import { ServicePlanRepository } from '../repositories/service-plan-repository'
import { useDatabase, type QueryExecutor, type TransactionalQueryExecutor } from '../utils/database'
import { getServicePlanDefinition, listServicePlanDefinitions } from './service-plan-definitions'

const activationCapabilities: ServiceCapability[] = [
  'wordpress-update-monitoring',
  'uptime-monitoring',
  'annual-sitehealth-checkup',
  'long-term-backups'
]

export interface PlanChangeInput {
  action: 'change-plan' | 'cancel-service' | 'cancel-pending-change'
  targetPlanId?: ServicePlanId
  effectiveAt?: string
  paidThroughAt?: string | null
  reason: string
  actorIdentifier: string
}

export interface PlanChangePreview {
  action: PlanChangeInput['action']
  transitionType: 'upgrade' | 'downgrade' | 'cancellation' | 'cancel-pending-change'
  fromPlanId: ServicePlanId
  toPlanId: ServicePlanId | null
  effectiveAt: string
  immediate: boolean
  gainedCapabilities: ServiceCapability[]
  lostCapabilities: ServiceCapability[]
  summary: string
}

export interface EntitlementOverrideInput {
  overrideType: EntitlementOverrideType
  capability?: ServiceCapability | null
  value: unknown
  reason: string
  startsAt?: string
  expiresAt?: string | null
}

export class EntitlementService {
  constructor(
    private readonly database: QueryExecutor | TransactionalQueryExecutor = useDatabase()
  ) {}

  listPlans() {
    return listServicePlanDefinitions()
  }

  async get(siteId: string, at: Date = new Date()): Promise<EffectiveEntitlements> {
    const asOf = at.toISOString()
    await this.synchronizeTemporalState(siteId, asOf)
    const repository = new ServicePlanRepository(this.database)
    const context = await repository.findSiteContext(siteId)
    const subscription = await repository.findSubscription(siteId)
    const pendingTransition = await repository.findPendingTransition(siteId)
    const activeOverrides = await repository.listActiveOverrides(siteId, asOf)
    if (!context) throw new Error('The site must be assigned to a client account.')
    if (!subscription) throw new Error('The site does not have a SiteCare plan.')

    const plan = getServicePlanDefinition(subscription.planId)
    const capabilities = { ...plan.capabilities }
    const settings = { ...plan.defaults }
    const operationalStatus = context.siteStatus === 'disabled'
      ? 'site-disabled'
      : subscription.status === 'cancelled'
        ? 'cancelled'
        : context.clientAccountStatus === 'suspended'
          ? 'suspended'
          : 'active'

    if (operationalStatus === 'active') {
      for (const override of activeOverrides) {
        this.applyOverride(capabilities, settings, override)
      }
    } else {
      for (const capability of activationCapabilities) capabilities[capability] = false
    }

    if (!capabilities['uptime-monitoring']) {
      settings.uptimeIntervalMinutes = null
      settings.uptimeAlertFailureThreshold = null
    }
    if (!capabilities['annual-sitehealth-checkup']) settings.annualSiteHealthCheckups = 0
    if (!capabilities['long-term-backups']) {
      settings.longTermBackupFrequency = null
      settings.longTermBackupRetentionMonths = null
      settings.longTermBackupDestinationCount = null
    }

    return {
      siteId,
      clientAccountId: context.clientAccountId,
      clientAccountStatus: context.clientAccountStatus,
      siteStatus: context.siteStatus,
      underlyingPlan: plan,
      subscriptionStatus: subscription.status,
      operationalStatus,
      capabilities,
      settings,
      annualCheckupEligibleAt: subscription.annualCheckupEligibleAt,
      paidThroughAt: subscription.paidThroughAt,
      pendingTransition,
      activeOverrides,
      evaluatedAt: asOf
    }
  }

  async getManagementDetail(siteId: string, at: Date = new Date()) {
    const repository = new ServicePlanRepository(this.database)
    const effective = await this.get(siteId, at)
    const [subscription, transitions, overrides, activationIntents] = await Promise.all([
      repository.findSubscription(siteId),
      repository.listTransitions(siteId),
      repository.listOverrides(siteId),
      repository.listActivationIntents(siteId)
    ])
    if (!subscription) throw new Error('The site does not have a SiteCare plan.')
    return { effective, subscription, transitions, overrides, activationIntents }
  }

  async assertCapability(siteId: string, capability: ServiceCapability, at: Date = new Date()): Promise<EffectiveEntitlements> {
    const effective = await this.get(siteId, at)
    if (!effective.capabilities[capability]) {
      throw new Error(`${effective.underlyingPlan.name} does not currently provide ${capability.replaceAll('-', ' ')} for this site.`)
    }
    return effective
  }

  async assignInitialPlan(
    siteId: string,
    planId: ServicePlanId,
    actorIdentifier: string,
    reason = 'Initial SiteCare plan assignment.',
    at: Date = new Date()
  ): Promise<EffectiveEntitlements> {
    if (!isServicePlanId(planId)) throw new Error('A valid SiteCare plan is required.')
    const now = at.toISOString()
    await this.withTransaction(async executor => {
      const repository = new ServicePlanRepository(executor)
      if (!await repository.findSiteContext(siteId)) throw new Error('The site must be assigned to a client account first.')
      if (await repository.findSubscription(siteId, true)) throw new Error('The site already has a SiteCare plan.')
      const transition = this.transition({
        siteId,
        transitionType: 'initial-assignment',
        fromPlanId: null,
        toPlanId: planId,
        status: 'applied',
        reason: this.requiredReason(reason),
        actorIdentifier,
        requestedAt: now,
        effectiveAt: now,
        appliedAt: now
      })
      await repository.saveSubscription({
        siteId,
        planId,
        status: 'active',
        serviceStartedAt: now,
        annualCheckupEligibleAt: now,
        paidThroughAt: null,
        cancelledAt: null,
        createdAt: now,
        updatedAt: now
      })
      await repository.createTransition(transition)
      await this.createActivationIntents(executor, transition, [], planId, now)
      await this.audit(executor, siteId, actorIdentifier, 'service-plan.assigned', {
        planId,
        transitionId: transition.id
      }, now)
    })
    return this.get(siteId, at)
  }

  async previewChange(siteId: string, input: Omit<PlanChangeInput, 'actorIdentifier' | 'reason'>, at: Date = new Date()): Promise<PlanChangePreview> {
    const effective = await this.get(siteId, at)
    const repository = new ServicePlanRepository(this.database)
    const pending = await repository.findPendingTransition(siteId)
    const now = at.toISOString()

    if (input.action === 'cancel-pending-change') {
      if (!pending) throw new Error('There is no pending plan change to cancel.')
      return {
        action: input.action,
        transitionType: 'cancel-pending-change',
        fromPlanId: effective.underlyingPlan.id,
        toPlanId: pending.toPlanId,
        effectiveAt: now,
        immediate: true,
        gainedCapabilities: [],
        lostCapabilities: [],
        summary: `Cancel the scheduled ${pending.transitionType} effective ${this.displayDate(pending.effectiveAt)}.`
      }
    }

    if (pending) throw new Error('Cancel the existing pending plan change before scheduling another one.')

    if (input.action === 'cancel-service') {
      if (effective.subscriptionStatus === 'cancelled') throw new Error('SiteCare service is already cancelled for this site.')
      const effectiveAt = this.futureEffectiveDate(input.effectiveAt, at)
      return {
        action: input.action,
        transitionType: 'cancellation',
        fromPlanId: effective.underlyingPlan.id,
        toPlanId: null,
        effectiveAt,
        immediate: false,
        gainedCapabilities: [],
        lostCapabilities: this.enabledOperationalCapabilities(effective.underlyingPlan.id),
        summary: `Keep ${effective.underlyingPlan.name} active through ${this.displayDate(effectiveAt)}, then stop monitoring, checkups, update services, and new long-term backups.`
      }
    }

    if (!isServicePlanId(input.targetPlanId)) throw new Error('A valid target plan is required.')
    if (effective.subscriptionStatus === 'cancelled') throw new Error('Cancelled service cannot be changed without a separate reactivation workflow.')
    const from = effective.underlyingPlan
    const to = getServicePlanDefinition(input.targetPlanId)
    if (from.id === to.id) throw new Error('The target plan must be different from the current plan.')
    const transitionType = to.rank > from.rank ? 'upgrade' : 'downgrade'
    const effectiveAt = transitionType === 'upgrade' ? now : this.futureEffectiveDate(input.effectiveAt, at)
    const gainedCapabilities = this.capabilityDifference(from.id, to.id, true)
    const lostCapabilities = this.capabilityDifference(from.id, to.id, false)
    return {
      action: input.action,
      transitionType,
      fromPlanId: from.id,
      toPlanId: to.id,
      effectiveAt,
      immediate: transitionType === 'upgrade',
      gainedCapabilities,
      lostCapabilities,
      summary: transitionType === 'upgrade'
        ? `Upgrade immediately to ${to.name} and make newly included services eligible now.`
        : `Keep ${from.name} through ${this.displayDate(effectiveAt)}, then change to ${to.name}. Existing backups retain their original expiration dates.`
    }
  }

  async applyChange(siteId: string, input: PlanChangeInput, at: Date = new Date()): Promise<{
    preview: PlanChangePreview
    effective: EffectiveEntitlements
  }> {
    const reason = this.requiredReason(input.reason)
    const preview = await this.previewChange(siteId, input, at)
    const now = at.toISOString()

    await this.withTransaction(async executor => {
      const repository = new ServicePlanRepository(executor)
      const subscription = await repository.findSubscription(siteId, true)
      if (!subscription) throw new Error('The site does not have a SiteCare plan.')

      if (input.action === 'cancel-pending-change') {
        const pending = await repository.findPendingTransition(siteId, true)
        if (!pending) throw new Error('There is no pending plan change to cancel.')
        await repository.updateTransition({
          ...pending,
          status: 'cancelled',
          cancelledAt: now,
          cancelledBy: input.actorIdentifier,
          cancellationReason: reason
        })
        await this.audit(executor, siteId, input.actorIdentifier, 'service-plan.pending-change-cancelled', {
          transitionId: pending.id,
          transitionType: pending.transitionType,
          effectiveAt: pending.effectiveAt,
          reason
        }, now)
        return
      }

      if (preview.transitionType === 'cancel-pending-change') {
        throw new Error('The pending plan change could not be resolved.')
      }

      if (subscription.planId !== preview.fromPlanId || subscription.status !== 'active') {
        throw new Error('The service plan changed after the preview was generated. Generate a new preview and try again.')
      }
      if (await repository.findPendingTransition(siteId, true)) {
        throw new Error('A pending plan change was created after the preview was generated. Review it before continuing.')
      }

      const transition = this.transition({
        siteId,
        transitionType: preview.transitionType,
        fromPlanId: preview.fromPlanId,
        toPlanId: preview.toPlanId,
        status: preview.immediate ? 'applied' : 'scheduled',
        reason,
        actorIdentifier: input.actorIdentifier,
        requestedAt: now,
        effectiveAt: preview.effectiveAt,
        appliedAt: preview.immediate ? now : null
      })
      await repository.createTransition(transition)

      if (preview.transitionType === 'upgrade') {
        await repository.saveSubscription({
          ...subscription,
          planId: preview.toPlanId!,
          status: 'active',
          annualCheckupEligibleAt: now,
          paidThroughAt: input.paidThroughAt === undefined ? subscription.paidThroughAt : input.paidThroughAt,
          cancelledAt: null,
          updatedAt: now
        })
        await this.createActivationIntents(executor, transition, preview.gainedCapabilities, preview.toPlanId!, now)
        await this.audit(executor, siteId, input.actorIdentifier, 'service-plan.upgraded', {
          transitionId: transition.id,
          fromPlanId: preview.fromPlanId,
          toPlanId: preview.toPlanId,
          gainedCapabilities: preview.gainedCapabilities,
          reason
        }, now)
      } else {
        await repository.saveSubscription({
          ...subscription,
          paidThroughAt: preview.effectiveAt,
          updatedAt: now
        })
        await this.audit(executor, siteId, input.actorIdentifier,
          preview.transitionType === 'downgrade' ? 'service-plan.downgrade-scheduled' : 'service-plan.cancellation-scheduled', {
            transitionId: transition.id,
            fromPlanId: preview.fromPlanId,
            toPlanId: preview.toPlanId,
            effectiveAt: preview.effectiveAt,
            reason
          }, now)
      }
    })

    return { preview, effective: await this.get(siteId, at) }
  }

  async createOverride(
    siteId: string,
    input: EntitlementOverrideInput,
    actorIdentifier: string,
    at: Date = new Date()
  ): Promise<EntitlementOverride> {
    const normalized = this.normalizeOverrideInput(input, at)
    const now = at.toISOString()
    return this.withTransaction(async executor => {
      const repository = new ServicePlanRepository(executor)
      if (!await repository.findSubscription(siteId, true)) throw new Error('The site does not have a SiteCare plan.')
      await this.assertNoOverlappingOverride(repository, siteId, normalized)
      const override: EntitlementOverride = {
        id: randomUUID(),
        siteId,
        ...normalized,
        createdBy: actorIdentifier,
        createdAt: now,
        updatedAt: now,
        expiredAt: null,
        removedAt: null,
        removedBy: null,
        removalReason: null
      }
      await repository.createOverride(override)
      await this.audit(executor, siteId, actorIdentifier, 'entitlement.override.created', this.overrideAuditMetadata(override), now)
      return override
    })
  }

  async updateOverride(
    siteId: string,
    overrideId: string,
    input: EntitlementOverrideInput,
    actorIdentifier: string,
    at: Date = new Date()
  ): Promise<EntitlementOverride> {
    const normalized = this.normalizeOverrideInput(input, at)
    const now = at.toISOString()
    return this.withTransaction(async executor => {
      const repository = new ServicePlanRepository(executor)
      if (!await repository.findSubscription(siteId, true)) throw new Error('The site does not have a SiteCare plan.')
      const existing = await repository.findOverride(siteId, overrideId, true)
      if (!existing) throw new Error('Entitlement override not found.')
      if (existing.expiredAt || existing.removedAt) throw new Error('Expired or removed overrides cannot be changed.')
      await this.assertNoOverlappingOverride(repository, siteId, normalized, overrideId)
      const override = await repository.updateOverride({
        ...existing,
        ...normalized,
        updatedAt: now
      })
      await this.audit(executor, siteId, actorIdentifier, 'entitlement.override.updated', this.overrideAuditMetadata(override), now)
      return override
    })
  }

  async removeOverride(
    siteId: string,
    overrideId: string,
    reason: string,
    actorIdentifier: string,
    at: Date = new Date()
  ): Promise<EntitlementOverride> {
    const removalReason = this.requiredReason(reason)
    const now = at.toISOString()
    return this.withTransaction(async executor => {
      const repository = new ServicePlanRepository(executor)
      const existing = await repository.findOverride(siteId, overrideId, true)
      if (!existing) throw new Error('Entitlement override not found.')
      if (existing.expiredAt || existing.removedAt) throw new Error('The override is no longer active.')
      const removed = await repository.updateOverride({
        ...existing,
        removedAt: now,
        removedBy: actorIdentifier,
        removalReason,
        updatedAt: now
      })
      await this.audit(executor, siteId, actorIdentifier, 'entitlement.override.removed', {
        ...this.overrideAuditMetadata(removed),
        removalReason
      }, now)
      return removed
    })
  }

  async changeClientStatus(
    clientAccountId: string,
    status: 'active' | 'suspended',
    reason: string,
    actorIdentifier: string,
    at: Date = new Date()
  ): Promise<void> {
    const normalizedReason = this.requiredReason(reason)
    const now = at.toISOString()
    const siteIds = await new IdentityRepository(this.database).listClientSiteIdsDirect(clientAccountId)
    for (const siteId of siteIds) await this.synchronizeTemporalState(siteId, now)

    await this.withTransaction(async executor => {
      const identityRepository = new IdentityRepository(executor)
      const client = await identityRepository.findClientAccount(clientAccountId, true)
      if (!client) throw new Error('Client account not found.')
      if (client.isPlaceholder) throw new Error('The migration placeholder client cannot be suspended.')
      if (client.status === status) throw new Error(`Client account is already ${status}.`)
      await identityRepository.updateClientAccount({ ...client, status, updatedAt: now })

      const planRepository = new ServicePlanRepository(executor)
      for (const siteId of siteIds) {
        const subscription = await planRepository.findSubscription(siteId, true)
        if (!subscription) continue
        const transition = this.transition({
          siteId,
          transitionType: status === 'suspended' ? 'suspension' : 'reactivation',
          fromPlanId: subscription.planId,
          toPlanId: subscription.planId,
          status: 'applied',
          reason: normalizedReason,
          actorIdentifier,
          requestedAt: now,
          effectiveAt: now,
          appliedAt: now
        })
        await planRepository.createTransition(transition)
        if (status === 'suspended') {
          await planRepository.cancelPendingActivationIntents(siteId, activationCapabilities, now)
        } else if (subscription.status === 'active') {
          await this.createActivationIntents(executor, transition, [], subscription.planId, now)
        }
        await this.audit(executor, siteId, actorIdentifier,
          status === 'suspended' ? 'client.service-suspended' : 'client.service-reactivated', {
            clientAccountId,
            planId: subscription.planId,
            transitionId: transition.id,
            reason: normalizedReason
          }, now)
      }
      await this.audit(executor, null, actorIdentifier,
        status === 'suspended' ? 'client.suspended' : 'client.reactivated', {
          clientAccountId,
          affectedSiteCount: siteIds.length,
          reason: normalizedReason
        }, now)
    })
  }

  private async synchronizeTemporalState(siteId: string, asOf: string): Promise<void> {
    await this.withTransaction(async executor => {
      const repository = new ServicePlanRepository(executor)
      const subscription = await repository.findSubscription(siteId, true)
      if (!subscription) return
      const pending = await repository.findPendingTransition(siteId, true)
      if (pending && pending.effectiveAt <= asOf) {
        await this.applyScheduledTransition(executor, repository, subscription, pending, asOf)
      }
      for (const override of await repository.listDueOverrides(siteId, asOf)) {
        await repository.updateOverride({ ...override, expiredAt: asOf, updatedAt: asOf })
        await this.audit(executor, siteId, 'system:entitlement-evaluator', 'entitlement.override.expired', this.overrideAuditMetadata(override), asOf)
      }
    })
  }

  private async applyScheduledTransition(
    executor: QueryExecutor,
    repository: ServicePlanRepository,
    subscription: SiteServiceSubscription,
    transition: SitePlanTransition,
    appliedAt: string
  ): Promise<void> {
    if (transition.transitionType === 'downgrade' && transition.toPlanId) {
      const lostCapabilities = this.capabilityDifference(subscription.planId, transition.toPlanId, false)
      await repository.saveSubscription({
        ...subscription,
        planId: transition.toPlanId,
        paidThroughAt: null,
        updatedAt: appliedAt
      })
      await repository.cancelPendingActivationIntents(transition.siteId, lostCapabilities, appliedAt)
      await repository.updateTransition({ ...transition, status: 'applied', appliedAt })
      await this.audit(executor, transition.siteId, 'system:entitlement-evaluator', 'service-plan.downgraded', {
        transitionId: transition.id,
        fromPlanId: transition.fromPlanId,
        toPlanId: transition.toPlanId,
        lostCapabilities,
        effectiveAt: transition.effectiveAt
      }, appliedAt)
      return
    }

    if (transition.transitionType === 'cancellation') {
      await repository.saveSubscription({
        ...subscription,
        status: 'cancelled',
        paidThroughAt: null,
        cancelledAt: transition.effectiveAt,
        updatedAt: appliedAt
      })
      await repository.cancelPendingActivationIntents(transition.siteId, activationCapabilities, appliedAt)
      await repository.updateTransition({ ...transition, status: 'applied', appliedAt })
      await this.audit(executor, transition.siteId, 'system:entitlement-evaluator', 'service-plan.cancelled', {
        transitionId: transition.id,
        planId: subscription.planId,
        effectiveAt: transition.effectiveAt
      }, appliedAt)
    }
  }

  private async createActivationIntents(
    executor: QueryExecutor,
    transition: SitePlanTransition,
    gainedCapabilities: ServiceCapability[],
    planId: ServicePlanId,
    eligibleAt: string
  ): Promise<void> {
    const plan = getServicePlanDefinition(planId)
    const capabilities = gainedCapabilities.length > 0
      ? gainedCapabilities.filter(capability => activationCapabilities.includes(capability))
      : activationCapabilities.filter(capability => plan.capabilities[capability])
    const repository = new ServicePlanRepository(executor)
    for (const capability of capabilities) {
      const intent: ServiceActivationIntent = {
        id: randomUUID(),
        siteId: transition.siteId,
        capability,
        sourceTransitionId: transition.id,
        status: 'pending',
        eligibleAt,
        createdAt: eligibleAt,
        acknowledgedAt: null,
        cancelledAt: null
      }
      await repository.createActivationIntent(intent)
    }
  }

  private applyOverride(
    capabilities: Record<ServiceCapability, boolean>,
    settings: EffectiveEntitlements['settings'],
    override: EntitlementOverride
  ): void {
    if (override.overrideType === 'service-exception' && override.capability) {
      capabilities[override.capability] = override.value as boolean
    } else if (override.overrideType === 'uptime-interval-minutes') {
      settings.uptimeIntervalMinutes = override.value as number
    } else if (override.overrideType === 'uptime-alert-threshold') {
      settings.uptimeAlertFailureThreshold = override.value as number
    } else if (override.overrideType === 'long-term-backup-frequency') {
      settings.longTermBackupFrequency = override.value as BackupScheduleFrequency
    }
  }

  private normalizeOverrideInput(input: EntitlementOverrideInput, at: Date): Pick<
    EntitlementOverride,
    'overrideType' | 'capability' | 'value' | 'reason' | 'startsAt' | 'expiresAt'
  > {
    const overrideTypes: EntitlementOverrideType[] = [
      'service-exception',
      'uptime-interval-minutes',
      'uptime-alert-threshold',
      'long-term-backup-frequency'
    ]
    if (!overrideTypes.includes(input.overrideType)) throw new Error('Unsupported entitlement override type.')
    const reason = this.requiredReason(input.reason)
    const startsAt = this.validDate(input.startsAt ?? at.toISOString(), 'Override start time')
    const expiresAt = input.expiresAt ? this.validDate(input.expiresAt, 'Override expiration') : null
    if (expiresAt && expiresAt <= startsAt) throw new Error('Override expiration must be after its start time.')

    if (input.overrideType === 'service-exception') {
      if (!isServiceCapability(input.capability)) throw new Error('A valid service capability is required.')
      if (typeof input.value !== 'boolean') throw new Error('A service exception value must be true or false.')
      return { overrideType: input.overrideType, capability: input.capability, value: input.value, reason, startsAt, expiresAt }
    }
    if (input.capability) throw new Error('This override type does not accept a capability.')
    if (input.overrideType === 'uptime-interval-minutes') {
      if (!Number.isInteger(input.value) || (input.value as number) < 1 || (input.value as number) > 60) {
        throw new Error('Uptime interval must be a whole number from 1 to 60 minutes.')
      }
      return { overrideType: input.overrideType, capability: null, value: input.value as number, reason, startsAt, expiresAt }
    }
    if (input.overrideType === 'uptime-alert-threshold') {
      if (!Number.isInteger(input.value) || (input.value as number) < 1 || (input.value as number) > 20) {
        throw new Error('Uptime alert threshold must be a whole number from 1 to 20 failures.')
      }
      return { overrideType: input.overrideType, capability: null, value: input.value as number, reason, startsAt, expiresAt }
    }
    if (!['daily', 'weekly', 'monthly'].includes(String(input.value))) {
      throw new Error('Long-term backup frequency must be daily, weekly, or monthly.')
    }
    return {
      overrideType: input.overrideType,
      capability: null,
      value: input.value as BackupScheduleFrequency,
      reason,
      startsAt,
      expiresAt
    }
  }

  private async assertNoOverlappingOverride(
    repository: ServicePlanRepository,
    siteId: string,
    candidate: Pick<EntitlementOverride, 'overrideType' | 'capability' | 'startsAt' | 'expiresAt'>,
    excludeId?: string
  ): Promise<void> {
    const overlaps = (await repository.listOverrides(siteId)).some(existing => {
      if (existing.id === excludeId || existing.expiredAt || existing.removedAt) return false
      if (existing.overrideType !== candidate.overrideType || existing.capability !== candidate.capability) return false
      const existingEnd = existing.expiresAt ?? '9999-12-31T23:59:59.999Z'
      const candidateEnd = candidate.expiresAt ?? '9999-12-31T23:59:59.999Z'
      return existing.startsAt < candidateEnd && candidate.startsAt < existingEnd
    })
    if (overlaps) throw new Error('An overlapping override already exists for this setting.')
  }

  private capabilityDifference(fromPlanId: ServicePlanId, toPlanId: ServicePlanId, gained: boolean): ServiceCapability[] {
    const from = getServicePlanDefinition(fromPlanId)
    const to = getServicePlanDefinition(toPlanId)
    return serviceCapabilities.filter(capability => gained
      ? !from.capabilities[capability] && to.capabilities[capability]
      : from.capabilities[capability] && !to.capabilities[capability])
  }

  private enabledOperationalCapabilities(planId: ServicePlanId): ServiceCapability[] {
    const plan = getServicePlanDefinition(planId)
    return activationCapabilities.filter(capability => plan.capabilities[capability])
  }

  private transition(input: {
    siteId: string
    transitionType: SitePlanTransition['transitionType']
    fromPlanId: ServicePlanId | null
    toPlanId: ServicePlanId | null
    status: SitePlanTransition['status']
    reason: string
    actorIdentifier: string
    requestedAt: string
    effectiveAt: string
    appliedAt: string | null
  }): SitePlanTransition {
    return {
      id: randomUUID(),
      siteId: input.siteId,
      transitionType: input.transitionType,
      fromPlanId: input.fromPlanId,
      toPlanId: input.toPlanId,
      status: input.status,
      reason: input.reason,
      requestedBy: input.actorIdentifier,
      requestedAt: input.requestedAt,
      effectiveAt: input.effectiveAt,
      appliedAt: input.appliedAt,
      cancelledAt: null,
      cancelledBy: null,
      cancellationReason: null
    }
  }

  private async audit(
    executor: QueryExecutor,
    siteId: string | null,
    actorIdentifier: string,
    eventType: string,
    metadata: Record<string, unknown>,
    createdAt: string
  ): Promise<void> {
    await new AuditRepository(executor).create({
      id: randomUUID(),
      siteId,
      actorType: actorIdentifier.startsWith('system:') ? 'system' : 'dashboard-user',
      actorIdentifier,
      eventType,
      metadata,
      createdAt
    })
  }

  private overrideAuditMetadata(override: EntitlementOverride): Record<string, unknown> {
    return {
      overrideId: override.id,
      overrideType: override.overrideType,
      capability: override.capability,
      value: override.value,
      startsAt: override.startsAt,
      expiresAt: override.expiresAt,
      reason: override.reason
    }
  }

  private requiredReason(value: string): string {
    const reason = value.trim()
    if (reason.length < 3) throw new Error('A reason of at least three characters is required.')
    if (reason.length > 500) throw new Error('The reason must not exceed 500 characters.')
    return reason
  }

  private futureEffectiveDate(value: string | undefined, at: Date): string {
    if (!value) throw new Error('The current paid-period end date is required.')
    const effectiveAt = this.validDate(value, 'Effective date')
    if (effectiveAt <= at.toISOString()) throw new Error('The effective date must be in the future.')
    return effectiveAt
  }

  private validDate(value: string, label: string): string {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid date and time.`)
    return date.toISOString()
  }

  private displayDate(value: string): string {
    return new Date(value).toISOString().slice(0, 10)
  }

  private async withTransaction<Result>(work: (executor: QueryExecutor) => Promise<Result>): Promise<Result> {
    if ('transaction' in this.database && typeof this.database.transaction === 'function') {
      return this.database.transaction(work)
    }
    return work(this.database)
  }
}
