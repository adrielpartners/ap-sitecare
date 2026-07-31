import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it } from 'node:test'
import { LocalVpsConnection } from '../backups/local-vps-connection'
import { AuditRepository } from '../repositories/audit-repository'
import { BackupRepository } from '../repositories/backup-repository'
import { SiteRepository } from '../repositories/site-repository'
import { createTestDatabase, destroyTestDatabase } from '../testing/postgres-test-database'
import { AuditService } from './audit-service'
import { BackupService } from './backup-service'
import { SiteService } from './site-service'

const entitledForLongTermBackups = {
  async assertCapability() { return {} }
}

async function createFixture() {
  const database = await createTestDatabase()
  const backupRepository = new BackupRepository(database)
  const auditRepository = new AuditRepository(database)
  const auditService = new AuditService(auditRepository)
  const siteService = new SiteService(new SiteRepository(database), auditService)
  const root = mkdtempSync(join(tmpdir(), 'apsc-backups-'))
  const wordpressPath = join(root, 'sites', 'example.com')
  mkdirSync(wordpressPath, { recursive: true })
  const service = new BackupService({
    dropboxAccessToken: 'test-token',
    dropboxBackupRoot: '/AP-SiteCare',
    dropboxAccountLabel: 'Test Dropbox',
    dropboxEnabled: true,
    dropboxTokenStrategy: 'runtime-access-token',
    allowedLocalBaseDirectories: [join(root, 'sites')],
    credentialEncryptionKey: 'test-encryption-key'
  }, backupRepository, siteService, auditService, undefined, entitledForLongTermBackups)
  const site = await siteService.create({ name: 'Backup Site', url: 'https://example.com' })
  return { auditRepository, backupRepository, database, service, site, root, wordpressPath }
}

describe('Remote backup foundation', () => {
  it('rejects local paths outside configured base directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'apsc-paths-'))
    const allowed = join(root, 'allowed')
    const outside = join(root, 'outside')
    mkdirSync(allowed)
    mkdirSync(outside)
    const adapter = new LocalVpsConnection([allowed])
    assert.throws(() => adapter.validatePath(outside), /outside the configured allowed base directories/)
  })

  it('calculates full local restore capability and audits policy changes', async () => {
    const { auditRepository, database, service, site, wordpressPath } = await createFixture()
    const result = await service.updatePolicy(site.id, {
      enabled: true,
      frequency: 'daily',
      filesEnabled: true,
      databaseEnabled: true,
      storageProvider: 'dropbox',
      keepDaily: 7,
      keepWeekly: 4,
      keepMonthly: 6,
      autoDeleteExpired: true,
      restoreEnabled: true,
      restoreRequiresConfirmation: false,
      connectionType: 'local-vps',
      localPath: wordpressPath,
      databaseConfigured: true,
      databaseHost: '127.0.0.1',
      databasePort: 3306,
      databaseName: 'wordpress',
      databaseUsername: 'wordpress',
      databasePassword: 'database-secret'
    }, 'operator@example.com')

    assert.equal(result.connectionAssessment.restoreCapability, 'full')
    assert.equal(JSON.stringify(result).includes('database-secret'), false)
    assert.equal(result.policy.restoreRequiresConfirmation, true)
    assert.equal((await auditRepository.listForSite(site.id)).some(event => event.eventType === 'backup.policy.updated'), true)
    await destroyTestDatabase(database)
  })

  it('queues backup work for the separate worker', async () => {
    const { database, service, site, wordpressPath } = await createFixture()
    await service.updatePolicy(site.id, {
      enabled: true,
      frequency: 'daily',
      filesEnabled: true,
      databaseEnabled: false,
      storageProvider: 'dropbox',
      keepDaily: 7,
      keepWeekly: 4,
      keepMonthly: 6,
      autoDeleteExpired: false,
      restoreEnabled: true,
      restoreRequiresConfirmation: true,
      connectionType: 'local-vps',
      localPath: wordpressPath,
      databaseConfigured: false
    }, 'operator@example.com')

    const result = await service.planManualBackup(site.id, 'operator@example.com')
    assert.equal(result.artifact.status, 'queued')
    assert.equal(result.job.runner, 'background-worker')
    assert.match(result.message, /separate background worker/)

    const restore = await service.prepareRestore(site.id, result.artifact.id, 'operator@example.com')
    assert.equal(restore.executionAvailable, false)
    assert.equal(restore.plan.status, 'preflight-failed')
    assert.equal(restore.plan.confirmationRequired, true)
    await destroyTestDatabase(database)
  })

  it('queues a database-only manual backup from plugin-detected credentials without a saved policy', async () => {
    const { database, service, site } = await createFixture()
    await service.recordDetectedBackupSource(site.id, {
      wordpressPath: null,
      databaseHost: '127.0.0.1',
      databasePort: 3306,
      databaseName: 'wordpress',
      databaseUsername: 'wordpress',
      databasePassword: 'database-secret',
      providerLabel: 'WordPress plugin',
      detectedAt: new Date().toISOString()
    })

    const result = await service.planManualBackup(site.id, 'operator@example.com')
    assert.equal(result.artifact.status, 'queued')
    assert.equal(result.artifact.filesIncluded, false)
    assert.equal(result.artifact.databaseIncluded, true)
    await destroyTestDatabase(database)
  })

  it('falls back to database-only manual backup when file access is selected but not worker-readable', async () => {
    const { backupRepository, database, service, site } = await createFixture()
    await service.recordDetectedBackupSource(site.id, {
      wordpressPath: '/home/example/public_html',
      databaseHost: '127.0.0.1',
      databasePort: 3306,
      databaseName: 'wordpress',
      databaseUsername: 'wordpress',
      databasePassword: 'database-secret',
      providerLabel: 'WordPress plugin',
      detectedAt: new Date().toISOString()
    })
    const now = new Date().toISOString()
    await backupRepository.savePolicy({
      siteId: site.id,
      enabled: true,
      frequency: 'daily',
      filesEnabled: true,
      databaseEnabled: true,
      storageProvider: 'dropbox',
      retention: { keepDaily: 7, keepWeekly: 4, keepMonthly: 6, autoDeleteExpired: false },
      restoreEnabled: true,
      restoreRequiresConfirmation: true,
      retentionMonths: 24,
      nextDueAt: now,
      lastScheduledPeriod: null,
      notes: null,
      createdAt: now,
      updatedAt: now
    })

    const result = await service.planManualBackup(site.id, 'operator@example.com')
    assert.equal(result.artifact.filesIncluded, false)
    assert.equal(result.artifact.databaseIncluded, true)
    assert.match(result.message, /Database backup job queued/)
    await destroyTestDatabase(database)
  })

  it('rejects symbolic links in the backup source tree', async () => {
    const { database, root, wordpressPath } = await createFixture()
    const outside = join(root, 'outside')
    mkdirSync(outside)
    symlinkSync(outside, join(wordpressPath, 'linked-outside'))
    const adapter = new LocalVpsConnection([join(root, 'sites')])
    await assert.rejects(adapter.validateTreeHasNoSymlinks(wordpressPath), /Symbolic links are not allowed/)
    await destroyTestDatabase(database)
  })

  it('deduplicates monthly Pro work, records 24-month retention, and audits retention dry runs', async () => {
    const { auditRepository, backupRepository, database, service, site, wordpressPath } = await createFixture()
    await service.updatePolicy(site.id, {
      enabled: true,
      frequency: 'monthly',
      filesEnabled: true,
      databaseEnabled: true,
      storageProvider: 'dropbox',
      keepDaily: 0,
      keepWeekly: 0,
      keepMonthly: 24,
      autoDeleteExpired: true,
      restoreEnabled: true,
      restoreRequiresConfirmation: true,
      connectionType: 'local-vps',
      localPath: wordpressPath,
      databaseConfigured: true,
      databaseHost: '127.0.0.1',
      databasePort: 3306,
      databaseName: 'wordpress',
      databaseUsername: 'wordpress',
      databasePassword: 'database-secret'
    }, 'operator@example.com')

    const scheduledAt = new Date('2026-08-15T12:00:00.000Z')
    const first = await service.planScheduledBackup(site.id, 'system:scheduler', scheduledAt)
    const policyAfterQueue = await backupRepository.getPolicy(site.id)
    if (!policyAfterQueue) throw new Error('Scheduled policy was not created.')
    await backupRepository.savePolicy({
      ...policyAfterQueue,
      nextDueAt: scheduledAt.toISOString(),
      lastScheduledPeriod: null,
      updatedAt: scheduledAt.toISOString()
    })
    const duplicate = await service.planScheduledBackup(site.id, 'system:scheduler', scheduledAt)
    assert.equal('artifact' in first, true)
    assert.equal('duplicate' in duplicate && duplicate.duplicate, true)
    assert.equal((await backupRepository.getPolicy(site.id))?.lastScheduledPeriod, '2026-08')
    const artifact = 'artifact' in first ? first.artifact : null
    if (!artifact) throw new Error('Scheduled artifact was not created.')
    assert.equal(artifact.expiresAt, '2028-08-15T12:00:00.000Z')
    assert.match(artifact.storagePath, /^\/AP-SiteCare\/Backup Site\/2026\/08\//)

    await backupRepository.updateArtifact({
      ...artifact,
      status: 'completed',
      completedAt: '2026-08-15T12:05:00.000Z',
      expiresAt: '2026-08-16T00:00:00.000Z'
    })
    const retention = await service.runRetentionDryRun('system:scheduler', new Date('2026-08-17T00:00:00.000Z'))
    assert.equal(retention.candidateCount, 1)
    assert.equal((await backupRepository.getArtifact(artifact.id))?.retentionState, 'expiration-due')
    assert.equal((await auditRepository.listForSite(site.id)).some(event => event.eventType === 'backup.retention.dry-run-completed'), false)
    const globalAudit = await auditRepository.list()
    assert.equal(globalAudit.some(event => event.eventType === 'backup.retention.dry-run-completed'), true)
    await destroyTestDatabase(database)
  })
})
