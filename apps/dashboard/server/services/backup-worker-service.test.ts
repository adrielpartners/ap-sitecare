import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it } from 'node:test'
import { BackupArtifactBuilder, type ProcessRunner } from '../backups/backup-artifact-builder'
import { DropboxStorageProvider } from '../backups/dropbox-storage-provider'
import type { StorageUploadResult } from '../backups/storage-provider'
import { AuditRepository } from '../repositories/audit-repository'
import { BackupRepository } from '../repositories/backup-repository'
import { SiteRepository } from '../repositories/site-repository'
import { createDatabase } from '../utils/database'
import { AuditService } from './audit-service'
import { BackupService } from './backup-service'
import { BackupWorkerService } from './backup-worker-service'
import { SiteService } from './site-service'

class FixtureProcessRunner implements ProcessRunner {
  constructor(private readonly failWith?: string) {}

  async run(executable: string, args: string[]): Promise<void> {
    if (this.failWith) throw new Error(this.failWith)
    if (executable.endsWith('/tar')) {
      await writeFile(args[1], 'fixture files archive')
      return
    }
    if (executable.endsWith('/mysqldump')) {
      const output = args.find(value => value.startsWith('--result-file='))?.slice('--result-file='.length)
      if (!output) throw new Error('Missing dump output.')
      await writeFile(output, 'CREATE TABLE fixture (id INT);')
      return
    }
    if (executable.endsWith('/gzip')) {
      await rename(args[1], `${args[1]}.gz`)
    }
  }
}

class FixtureDropboxStorage extends DropboxStorageProvider {
  uploaded: string[] = []

  constructor() {
    super('fixture-token', '/AP-SiteCare', 'Fixture Dropbox', true, 'runtime-access-token')
  }

  override async upload(localPath: string, destinationPath: string): Promise<StorageUploadResult> {
    this.uploaded.push(destinationPath)
    return { path: destinationPath, sizeBytes: (await stat(localPath)).size, verified: true }
  }
}

function createFixture(options?: { databaseEnabled?: boolean, runnerFailure?: string }) {
  const database = createDatabase(':memory:')
  const backupRepository = new BackupRepository(database)
  const auditRepository = new AuditRepository(database)
  const auditService = new AuditService(auditRepository)
  const siteRepository = new SiteRepository(database)
  const siteService = new SiteService(siteRepository, auditService)
  const root = mkdtempSync(join(tmpdir(), 'apsc-worker-'))
  const wordpressPath = join(root, 'sites', 'example.com')
  const tempRoot = join(root, 'temp')
  mkdirSync(join(wordpressPath, 'wp-content'), { recursive: true })
  writeFileSync(join(wordpressPath, 'wp-config.php'), '<?php // fixture')
  const settings = {
    dropboxAccessToken: 'fixture-token',
    dropboxBackupRoot: '/AP-SiteCare',
    dropboxAccountLabel: 'Fixture Dropbox',
    dropboxEnabled: true,
    dropboxTokenStrategy: 'runtime-access-token' as const,
    allowedLocalBaseDirectories: [join(root, 'sites')],
    credentialEncryptionKey: 'fixture-encryption-key'
  }
  const service = new BackupService(settings, backupRepository, siteService, auditService)
  const site = siteService.create({ name: 'Worker Fixture', url: 'https://example.com' })
  service.updatePolicy(site.id, {
    enabled: true,
    frequency: 'daily',
    filesEnabled: true,
    databaseEnabled: options?.databaseEnabled ?? false,
    storageProvider: 'dropbox',
    keepDaily: 7,
    keepWeekly: 4,
    keepMonthly: 6,
    autoDeleteExpired: false,
    restoreEnabled: false,
    restoreRequiresConfirmation: true,
    connectionType: 'local-vps',
    localPath: wordpressPath,
    databaseConfigured: Boolean(options?.databaseEnabled),
    databaseHost: options?.databaseEnabled ? '127.0.0.1' : null,
    databasePort: 3306,
    databaseName: options?.databaseEnabled ? 'wordpress' : null,
    databaseUsername: options?.databaseEnabled ? 'wordpress' : null,
    databasePassword: options?.databaseEnabled ? 'super-secret-database-password' : null
  }, 'operator@example.com')
  const queued = service.planManualBackup(site.id, 'operator@example.com')
  const storage = new FixtureDropboxStorage()
  const worker = new BackupWorkerService({
    ...settings,
    tempRoot,
    staleAfterMinutes: 60
  }, backupRepository, siteRepository, auditService, new BackupArtifactBuilder(new FixtureProcessRunner(options?.runnerFailure)), storage)
  return { auditRepository, backupRepository, database, queued, storage, worker }
}

describe('Backup execution worker', () => {
  it('prevents duplicate claims for the same queued job', () => {
    const { backupRepository } = createFixture()
    const first = backupRepository.claimNextQueuedJob(new Date().toISOString())
    const second = backupRepository.claimNextQueuedJob(new Date().toISOString())
    assert.ok(first)
    assert.equal(second, null)
  })

  it('marks stale running jobs and artifacts failed', () => {
    const { backupRepository, queued } = createFixture()
    const claimed = backupRepository.claimNextQueuedJob('2026-01-01T00:00:00.000Z')
    assert.ok(claimed)
    const failed = backupRepository.failStaleJobs('2026-01-01T00:01:00.000Z', '2026-01-01T00:02:00.000Z')
    assert.equal(failed.length, 1)
    assert.equal(backupRepository.getArtifact(queued.artifact.id)?.status, 'failed')
  })

  it('rejects unsafe Dropbox destination paths', () => {
    const storage = new FixtureDropboxStorage()
    assert.throws(() => storage.destinationPath('../outside', 'artifact.tar.gz'), /destination path is invalid/)
  })

  it('creates a manifest and checksums, uploads evidence, and completes the job', async () => {
    const { auditRepository, backupRepository, queued, storage, worker } = createFixture()
    const result = await worker.runNext()
    const artifact = backupRepository.getArtifact(queued.artifact.id)
    assert.equal(result?.status, 'completed')
    assert.equal(artifact?.status, 'completed')
    assert.ok(artifact?.manifest)
    assert.ok(artifact?.checksumVerifiedAt)
    assert.ok(artifact?.uploadVerifiedAt)
    assert.deepEqual(storage.uploaded.map(path => path.split('/').at(-1)).sort(), [
      'checksum.sha256',
      'manifest.json',
      'wordpress-files.tar.gz'
    ])
    assert.equal(auditRepository.listForSite(queued.artifact.siteId).some(event => event.eventType === 'backup.completed'), true)
  })

  it('fails clearly and does not persist secrets in jobs, artifacts, or audit events', async () => {
    const secret = 'super-secret-database-password'
    const { auditRepository, backupRepository, database, queued, worker } = createFixture({
      databaseEnabled: true,
      runnerFailure: `mysqldump failed password=${secret}`
    })
    const result = await worker.runNext()
    assert.equal(result?.status, 'failed')
    const persisted = JSON.stringify({
      job: backupRepository.getJobForBackup(queued.artifact.id),
      artifact: backupRepository.getArtifact(queued.artifact.id),
      audit: auditRepository.listForSite(queued.artifact.siteId)
    })
    assert.equal(persisted.includes(secret), false)
    assert.match(result?.errorMessage ?? '', /\[redacted\]/)
    const stored = database.prepare('SELECT database_password_ciphertext FROM hosting_connections').get() as { database_password_ciphertext: string }
    assert.equal(stored.database_password_ciphertext.includes(secret), false)
  })
})
