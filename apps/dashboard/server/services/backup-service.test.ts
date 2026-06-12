import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it } from 'node:test'
import { LocalVpsConnection } from '../backups/local-vps-connection'
import { AuditRepository } from '../repositories/audit-repository'
import { BackupRepository } from '../repositories/backup-repository'
import { SiteRepository } from '../repositories/site-repository'
import { createDatabase } from '../utils/database'
import { AuditService } from './audit-service'
import { BackupService } from './backup-service'
import { SiteService } from './site-service'

function createFixture() {
  const database = createDatabase(':memory:')
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
  }, new BackupRepository(database), siteService, auditService)
  const site = siteService.create({ name: 'Backup Site', url: 'https://example.com' })
  return { auditRepository, service, site, root, wordpressPath }
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

  it('calculates full local restore capability and audits policy changes', () => {
    const { auditRepository, service, site, wordpressPath } = createFixture()
    const result = service.updatePolicy(site.id, {
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
    assert.equal(auditRepository.listForSite(site.id).some(event => event.eventType === 'backup.policy.updated'), true)
  })

  it('queues backup work for the separate worker', () => {
    const { service, site, wordpressPath } = createFixture()
    service.updatePolicy(site.id, {
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

    const result = service.planManualBackup(site.id, 'operator@example.com')
    assert.equal(result.artifact.status, 'queued')
    assert.equal(result.job.runner, 'background-worker')
    assert.match(result.message, /separate background worker/)

    const restore = service.prepareRestore(site.id, result.artifact.id, 'operator@example.com')
    assert.equal(restore.executionAvailable, false)
    assert.equal(restore.plan.status, 'preflight-failed')
    assert.equal(restore.plan.confirmationRequired, true)
  })

  it('rejects symbolic links in the backup source tree', async () => {
    const { root, wordpressPath } = createFixture()
    const outside = join(root, 'outside')
    mkdirSync(outside)
    symlinkSync(outside, join(wordpressPath, 'linked-outside'))
    const adapter = new LocalVpsConnection([join(root, 'sites')])
    await assert.rejects(adapter.validateTreeHasNoSymlinks(wordpressPath), /Symbolic links are not allowed/)
  })
})
