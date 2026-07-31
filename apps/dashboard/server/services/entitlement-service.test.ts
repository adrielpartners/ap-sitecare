import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { AuditRepository } from '../repositories/audit-repository'
import { BackupRepository } from '../repositories/backup-repository'
import { CheckInRepository } from '../repositories/check-in-repository'
import { SiteRepository } from '../repositories/site-repository'
import { createTestDatabase, destroyTestDatabase } from '../testing/postgres-test-database'
import type { PostgresDatabase } from '../utils/database'
import { ClientRegistryService } from './client-registry-service'
import { EntitlementService } from './entitlement-service'
import { AuditService } from './audit-service'
import { BackupService } from './backup-service'
import { HealthService } from './health-service'
import { PluginReportingService } from './plugin-reporting-service'
import { SiteService } from './site-service'

let database: PostgresDatabase
let clients: ClientRegistryService
let entitlements: EntitlementService

before(async () => {
  database = await createTestDatabase()
  clients = new ClientRegistryService(database)
  entitlements = new EntitlementService(database)
})

after(async () => {
  await destroyTestDatabase(database)
})

async function managedSite(planId: 'sitecare-core' | 'sitecare-plus' | 'sitecare-pro', suffix: string) {
  const client = await clients.createClient(`Client ${suffix}`, 'owner@example.com')
  const site = await clients.registerManagedSite({
    name: `Site ${suffix}`,
    url: `https://${suffix.toLowerCase()}.example.com`,
    clientAccountId: client.id,
    planId,
    actorIdentifier: 'owner@example.com'
  })
  return { client, site }
}

test('immutable plan matrix and client ownership cover multiple sites', async () => {
  const plans = entitlements.listPlans()
  assert.deepEqual(plans.map(plan => plan.id), ['sitecare-core', 'sitecare-plus', 'sitecare-pro'])
  assert.equal(plans[0]?.name, 'SiteCare Core')
  assert.equal(plans[2]?.defaults.uptimeIntervalMinutes, 5)
  assert.equal(plans[2]?.defaults.uptimeAlertFailureThreshold, 2)
  assert.equal(plans[2]?.defaults.longTermBackupRetentionMonths, 24)
  assert.equal(Object.isFrozen(plans[0]), true)
  assert.equal(Object.isFrozen(plans[0]?.capabilities), true)

  const client = await clients.createClient('Multi-site Client', 'owner@example.com')
  const first = await clients.registerManagedSite({
    name: 'First Site',
    url: 'https://first-multi.example.com',
    clientAccountId: client.id,
    planId: 'sitecare-core',
    actorIdentifier: 'owner@example.com'
  })
  const second = await clients.registerManagedSite({
    name: 'Second Site',
    url: 'https://second-multi.example.com',
    clientAccountId: client.id,
    planId: 'sitecare-plus',
    actorIdentifier: 'owner@example.com'
  })
  const detail = await clients.getClient(client.id)
  assert.deepEqual(detail.sites.map(item => item.site.id).sort(), [first.id, second.id].sort())
  assert.equal(detail.sites.find(item => item.site.id === first.id)?.service.effective.underlyingPlan.id, 'sitecare-core')
  assert.equal(detail.sites.find(item => item.site.id === second.id)?.service.effective.underlyingPlan.id, 'sitecare-plus')
})

test('upgrade applies immediately and creates activation intents for newly eligible services', async () => {
  const { site } = await managedSite('sitecare-core', 'Upgrade')
  const at = new Date('2026-08-01T12:00:00.000Z')
  const preview = await entitlements.previewChange(site.id, {
    action: 'change-plan',
    targetPlanId: 'sitecare-pro'
  }, at)
  assert.equal(preview.transitionType, 'upgrade')
  assert.equal(preview.immediate, true)
  assert.deepEqual(preview.gainedCapabilities, [
    'uptime-monitoring',
    'annual-sitehealth-checkup',
    'long-term-backups'
  ])

  const changed = await entitlements.applyChange(site.id, {
    action: 'change-plan',
    targetPlanId: 'sitecare-pro',
    reason: 'Client upgraded to Pro.',
    actorIdentifier: 'owner@example.com'
  }, at)
  assert.equal(changed.effective.underlyingPlan.id, 'sitecare-pro')
  assert.equal(changed.effective.capabilities['uptime-monitoring'], true)
  assert.equal(changed.effective.annualCheckupEligibleAt, at.toISOString())

  const detail = await entitlements.getManagementDetail(site.id, at)
  const upgrade = detail.transitions.find(transition => transition.transitionType === 'upgrade')
  assert.equal(upgrade?.status, 'applied')
  assert.deepEqual(
    detail.activationIntents
      .filter(intent => intent.sourceTransitionId === upgrade?.id)
      .map(intent => intent.capability)
      .sort(),
    ['annual-sitehealth-checkup', 'long-term-backups', 'uptime-monitoring'].sort()
  )
})

test('downgrade and cancellation remain active through the paid period then apply deterministically', async () => {
  const { site } = await managedSite('sitecare-pro', 'Lifecycle')
  const requestedAt = new Date('2026-08-02T12:00:00.000Z')
  const downgradeAt = '2026-09-01T12:00:00.000Z'
  await entitlements.applyChange(site.id, {
    action: 'change-plan',
    targetPlanId: 'sitecare-plus',
    effectiveAt: downgradeAt,
    reason: 'Downgrade at paid-period end.',
    actorIdentifier: 'owner@example.com'
  }, requestedAt)

  const before = await entitlements.get(site.id, new Date('2026-08-31T23:00:00.000Z'))
  assert.equal(before.underlyingPlan.id, 'sitecare-pro')
  assert.equal(before.pendingTransition?.transitionType, 'downgrade')
  const after = await entitlements.get(site.id, new Date('2026-09-01T12:00:01.000Z'))
  assert.equal(after.underlyingPlan.id, 'sitecare-plus')
  assert.equal(after.capabilities['long-term-backups'], false)
  assert.equal(after.capabilities['annual-sitehealth-checkup'], true)
  assert.equal(after.pendingTransition, null)

  const cancelAt = '2026-10-01T12:00:00.000Z'
  await entitlements.applyChange(site.id, {
    action: 'cancel-service',
    effectiveAt: cancelAt,
    reason: 'Cancel at the next paid-period end.',
    actorIdentifier: 'owner@example.com'
  }, new Date('2026-09-02T12:00:00.000Z'))
  const cancelled = await entitlements.get(site.id, new Date('2026-10-01T12:00:01.000Z'))
  assert.equal(cancelled.operationalStatus, 'cancelled')
  assert.equal(cancelled.capabilities['wordpress-update-monitoring'], false)
  assert.equal(cancelled.capabilities['annual-sitehealth-checkup'], false)
  assert.equal(cancelled.capabilities['hostinger-daily-backups'], true)

  const audits = await new AuditRepository(database).listForSite(site.id)
  assert.ok(audits.some(event => event.eventType === 'service-plan.downgraded'))
  assert.ok(audits.some(event => event.eventType === 'service-plan.cancelled'))
})

test('pending lifecycle changes can be cancelled with an audited reason', async () => {
  const { site } = await managedSite('sitecare-pro', 'Pending')
  const at = new Date('2026-08-03T12:00:00.000Z')
  await entitlements.applyChange(site.id, {
    action: 'change-plan',
    targetPlanId: 'sitecare-core',
    effectiveAt: '2026-09-03T12:00:00.000Z',
    reason: 'Initial downgrade request.',
    actorIdentifier: 'owner@example.com'
  }, at)
  await entitlements.applyChange(site.id, {
    action: 'cancel-pending-change',
    reason: 'Client retained the Pro plan.',
    actorIdentifier: 'owner@example.com'
  }, new Date('2026-08-04T12:00:00.000Z'))
  const effective = await entitlements.get(site.id, new Date('2026-10-01T12:00:00.000Z'))
  assert.equal(effective.underlyingPlan.id, 'sitecare-pro')
  assert.equal(effective.pendingTransition, null)
})

test('client suspension pauses operational services and reactivation restores plan entitlements', async () => {
  const { client, site } = await managedSite('sitecare-pro', 'Suspension')
  await clients.changeClientStatus(client.id, 'suspended', 'Temporarily suspend services.', 'owner@example.com')
  const suspended = await entitlements.get(site.id)
  assert.equal(suspended.operationalStatus, 'suspended')
  assert.equal(suspended.capabilities['uptime-monitoring'], false)
  assert.equal(suspended.capabilities['long-term-backups'], false)
  assert.equal(suspended.capabilities['hostinger-daily-backups'], true)

  await clients.changeClientStatus(client.id, 'active', 'Client account reactivated.', 'owner@example.com')
  const active = await entitlements.get(site.id)
  assert.equal(active.operationalStatus, 'active')
  assert.equal(active.capabilities['uptime-monitoring'], true)
  assert.equal(active.capabilities['long-term-backups'], true)
})

test('temporary overrides alter effective settings without changing plan identity and expire with audit history', async () => {
  const { site } = await managedSite('sitecare-core', 'Overrides')
  const startsAt = new Date('2026-08-05T12:00:00.000Z')
  const expiresAt = '2026-08-06T12:00:00.000Z'
  await entitlements.createOverride(site.id, {
    overrideType: 'service-exception',
    capability: 'uptime-monitoring',
    value: true,
    reason: 'Temporary uptime service exception.',
    startsAt: startsAt.toISOString(),
    expiresAt
  }, 'owner@example.com', startsAt)
  await entitlements.createOverride(site.id, {
    overrideType: 'uptime-interval-minutes',
    value: 10,
    reason: 'Use a ten-minute interval during the exception.',
    startsAt: startsAt.toISOString(),
    expiresAt
  }, 'owner@example.com', startsAt)

  const overridden = await entitlements.get(site.id, startsAt)
  assert.equal(overridden.underlyingPlan.id, 'sitecare-core')
  assert.equal(overridden.capabilities['uptime-monitoring'], true)
  assert.equal(overridden.settings.uptimeIntervalMinutes, 10)
  assert.equal(overridden.activeOverrides.length, 2)

  const expired = await entitlements.get(site.id, new Date('2026-08-06T12:00:01.000Z'))
  assert.equal(expired.underlyingPlan.id, 'sitecare-core')
  assert.equal(expired.capabilities['uptime-monitoring'], false)
  assert.equal(expired.activeOverrides.length, 0)
  const audits = await new AuditRepository(database).listForSite(site.id)
  assert.equal(audits.filter(event => event.eventType === 'entitlement.override.expired').length, 2)
})

test('existing update and long-term backup execution paths use the central entitlement decision', async () => {
  const { client, site } = await managedSite('sitecare-core', 'ExecutionGate')
  const sites = new SiteRepository(database)
  const audit = new AuditService(new AuditRepository(database))
  const siteService = new SiteService(sites, audit)
  const backups = new BackupService({
    dropboxAccessToken: 'test-token',
    dropboxBackupRoot: '/SiteCare Backups',
    dropboxAccountLabel: 'Test Dropbox',
    dropboxEnabled: true,
    dropboxTokenStrategy: 'oauth',
    allowedLocalBaseDirectories: ['/backup-sources'],
    credentialEncryptionKey: 'test-encryption-key'
  }, new BackupRepository(database), siteService, audit, undefined, entitlements)

  await assert.rejects(backups.updatePolicy(site.id, {
    enabled: true,
    frequency: 'monthly',
    filesEnabled: true,
    databaseEnabled: true,
    storageProvider: 'dropbox',
    keepDaily: 0,
    keepWeekly: 0,
    keepMonthly: 24,
    autoDeleteExpired: false,
    restoreEnabled: false,
    restoreRequiresConfirmation: true,
    connectionType: 'manual-unsupported',
    databaseConfigured: false
  }, 'owner@example.com'), /does not currently provide long term backups/)

  const reporting = new PluginReportingService(
    new HealthService(new CheckInRepository(database), sites, audit),
    null,
    entitlements
  )
  await reporting.recordCheckIn(site.id, '2026-08-01T00:00:00.000Z', {
    wordpressVersion: '6.8.1',
    phpVersion: '8.3.1',
    pluginUpdateCount: 0,
    themeUpdateCount: 0,
    lastCronRunAt: null
  })
  await clients.changeClientStatus(client.id, 'suspended', 'Pause update monitoring.', 'owner@example.com')
  await assert.rejects(reporting.recordCheckIn(site.id, '2026-09-01T00:00:01.000Z', {
    wordpressVersion: '6.8.1',
    phpVersion: '8.3.1',
    pluginUpdateCount: 0,
    themeUpdateCount: 0,
    lastCronRunAt: null
  }), /does not currently provide wordpress update monitoring/)
})
