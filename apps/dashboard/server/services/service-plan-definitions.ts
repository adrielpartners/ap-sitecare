import type { ServicePlanDefinition, ServicePlanId } from '../domain/service-plans'

const definitions = {
  'sitecare-core': {
    id: 'sitecare-core',
    name: 'SiteCare Core',
    rank: 1,
    capabilities: {
      'wordpress-update-monitoring': true,
      'hostinger-daily-backups': true,
      'uptime-monitoring': false,
      'annual-sitehealth-checkup': false,
      'long-term-backups': false
    },
    defaults: {
      uptimeIntervalMinutes: null,
      uptimeAlertFailureThreshold: null,
      annualSiteHealthCheckups: 0,
      hostingerBackupRetentionDays: 30,
      longTermBackupFrequency: null,
      longTermBackupRetentionMonths: null,
      longTermBackupDestinationCount: null
    }
  },
  'sitecare-plus': {
    id: 'sitecare-plus',
    name: 'SiteCare Plus',
    rank: 2,
    capabilities: {
      'wordpress-update-monitoring': true,
      'hostinger-daily-backups': true,
      'uptime-monitoring': false,
      'annual-sitehealth-checkup': true,
      'long-term-backups': false
    },
    defaults: {
      uptimeIntervalMinutes: null,
      uptimeAlertFailureThreshold: null,
      annualSiteHealthCheckups: 1,
      hostingerBackupRetentionDays: 30,
      longTermBackupFrequency: null,
      longTermBackupRetentionMonths: null,
      longTermBackupDestinationCount: null
    }
  },
  'sitecare-pro': {
    id: 'sitecare-pro',
    name: 'SiteCare Pro',
    rank: 3,
    capabilities: {
      'wordpress-update-monitoring': true,
      'hostinger-daily-backups': true,
      'uptime-monitoring': true,
      'annual-sitehealth-checkup': true,
      'long-term-backups': true
    },
    defaults: {
      uptimeIntervalMinutes: 5,
      uptimeAlertFailureThreshold: 2,
      annualSiteHealthCheckups: 1,
      hostingerBackupRetentionDays: 30,
      longTermBackupFrequency: 'monthly',
      longTermBackupRetentionMonths: 24,
      longTermBackupDestinationCount: 1
    }
  }
} as const satisfies Record<ServicePlanId, ServicePlanDefinition>

export const SERVICE_PLAN_DEFINITIONS: Readonly<Record<ServicePlanId, ServicePlanDefinition>> = Object.freeze({
  'sitecare-core': freezeDefinition(definitions['sitecare-core']),
  'sitecare-plus': freezeDefinition(definitions['sitecare-plus']),
  'sitecare-pro': freezeDefinition(definitions['sitecare-pro'])
})

export function listServicePlanDefinitions(): ServicePlanDefinition[] {
  return Object.values(SERVICE_PLAN_DEFINITIONS)
}

export function getServicePlanDefinition(planId: ServicePlanId): ServicePlanDefinition {
  return SERVICE_PLAN_DEFINITIONS[planId]
}

function freezeDefinition(definition: ServicePlanDefinition): ServicePlanDefinition {
  Object.freeze(definition.capabilities)
  Object.freeze(definition.defaults)
  return Object.freeze(definition)
}

