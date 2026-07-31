export const servicePlanIds = ['sitecare-core', 'sitecare-plus', 'sitecare-pro'] as const

export type ServicePlanId = typeof servicePlanIds[number]

export const serviceCapabilities = [
  'wordpress-update-monitoring',
  'hostinger-daily-backups',
  'uptime-monitoring',
  'annual-sitehealth-checkup',
  'long-term-backups'
] as const

export type ServiceCapability = typeof serviceCapabilities[number]

export type ServiceSubscriptionStatus = 'active' | 'cancelled'
export type PlanTransitionType =
  | 'initial-assignment'
  | 'upgrade'
  | 'downgrade'
  | 'cancellation'
  | 'suspension'
  | 'reactivation'
export type PlanTransitionStatus = 'scheduled' | 'applied' | 'cancelled'
export type EntitlementOverrideType =
  | 'service-exception'
  | 'uptime-interval-minutes'
  | 'uptime-alert-threshold'
  | 'long-term-backup-frequency'
export type BackupScheduleFrequency = 'daily' | 'weekly' | 'monthly'

export interface ServicePlanDefinition {
  id: ServicePlanId
  name: string
  rank: number
  capabilities: Record<ServiceCapability, boolean>
  defaults: {
    uptimeIntervalMinutes: number | null
    uptimeAlertFailureThreshold: number | null
    annualSiteHealthCheckups: number
    hostingerBackupRetentionDays: number
    longTermBackupFrequency: BackupScheduleFrequency | null
    longTermBackupRetentionMonths: number | null
    longTermBackupDestinationCount: number | null
  }
}

export interface SiteServiceSubscription {
  siteId: string
  planId: ServicePlanId
  status: ServiceSubscriptionStatus
  serviceStartedAt: string
  annualCheckupEligibleAt: string
  paidThroughAt: string | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
}

export interface SitePlanTransition {
  id: string
  siteId: string
  transitionType: PlanTransitionType
  fromPlanId: ServicePlanId | null
  toPlanId: ServicePlanId | null
  status: PlanTransitionStatus
  reason: string
  requestedBy: string
  requestedAt: string
  effectiveAt: string
  appliedAt: string | null
  cancelledAt: string | null
  cancelledBy: string | null
  cancellationReason: string | null
}

export interface EntitlementOverride {
  id: string
  siteId: string
  overrideType: EntitlementOverrideType
  capability: ServiceCapability | null
  value: boolean | number | BackupScheduleFrequency
  reason: string
  startsAt: string
  expiresAt: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  expiredAt: string | null
  removedAt: string | null
  removedBy: string | null
  removalReason: string | null
}

export interface ServiceActivationIntent {
  id: string
  siteId: string
  capability: ServiceCapability
  sourceTransitionId: string
  status: 'pending' | 'acknowledged' | 'cancelled'
  eligibleAt: string
  createdAt: string
  acknowledgedAt: string | null
  cancelledAt: string | null
}

export interface EffectiveEntitlements {
  siteId: string
  clientAccountId: string
  clientAccountStatus: 'active' | 'suspended'
  siteStatus: 'active' | 'disabled'
  underlyingPlan: ServicePlanDefinition
  subscriptionStatus: ServiceSubscriptionStatus
  operationalStatus: 'active' | 'suspended' | 'cancelled' | 'site-disabled'
  capabilities: Record<ServiceCapability, boolean>
  settings: {
    uptimeIntervalMinutes: number | null
    uptimeAlertFailureThreshold: number | null
    annualSiteHealthCheckups: number
    hostingerBackupRetentionDays: number
    longTermBackupFrequency: BackupScheduleFrequency | null
    longTermBackupRetentionMonths: number | null
    longTermBackupDestinationCount: number | null
  }
  annualCheckupEligibleAt: string
  paidThroughAt: string | null
  pendingTransition: SitePlanTransition | null
  activeOverrides: EntitlementOverride[]
  evaluatedAt: string
}

export interface ClientAccountWithPlaceholder {
  id: string
  name: string
  status: 'active' | 'suspended'
  isPlaceholder: boolean
  createdAt: string
  updatedAt: string
}

export function isServicePlanId(value: unknown): value is ServicePlanId {
  return typeof value === 'string' && servicePlanIds.includes(value as ServicePlanId)
}

export function isServiceCapability(value: unknown): value is ServiceCapability {
  return typeof value === 'string' && serviceCapabilities.includes(value as ServiceCapability)
}

