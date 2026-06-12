import { hostname } from 'node:os'
import { join, resolve } from 'node:path'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import type { BackupArtifact, BackupJob, BackupManifest, HostingConnection } from '../domain/types'
import { BackupArtifactBuilder, FILE_BACKUP_EXCLUSIONS, type BuiltBackupArtifact } from '../backups/backup-artifact-builder'
import { DropboxStorageProvider } from '../backups/dropbox-storage-provider'
import { LocalVpsConnection } from '../backups/local-vps-connection'
import { BackupRepository } from '../repositories/backup-repository'
import { SiteRepository } from '../repositories/site-repository'
import { decryptSecret } from '../utils/credential-crypto'
import { AuditService } from './audit-service'

export interface BackupWorkerSettings {
  allowedLocalBaseDirectories: string[]
  credentialEncryptionKey: string
  dropboxAccessToken: string
  dropboxBackupRoot: string
  dropboxAccountLabel: string
  dropboxEnabled: boolean
  dropboxTokenStrategy: 'runtime-access-token' | 'oauth'
  tempRoot: string
  staleAfterMinutes: number
}

export class BackupWorkerService {
  private readonly workerId = `${hostname()}:${process.pid}`

  constructor(
    private readonly settings: BackupWorkerSettings,
    private readonly repository = new BackupRepository(),
    private readonly sites = new SiteRepository(),
    private readonly audit = new AuditService(),
    private readonly builder = new BackupArtifactBuilder(),
    private readonly storage = new DropboxStorageProvider(
      settings.dropboxAccessToken,
      settings.dropboxBackupRoot,
      settings.dropboxAccountLabel,
      settings.dropboxEnabled,
      settings.dropboxTokenStrategy
    )
  ) {}

  async runNext(): Promise<BackupJob | null> {
    const now = new Date()
    const staleBefore = new Date(now.getTime() - this.settings.staleAfterMinutes * 60_000).toISOString()
    for (const stale of this.repository.failStaleJobs(staleBefore, now.toISOString())) {
      this.record(stale, 'backup.failed', { failure: stale.errorMessage })
    }
    const job = this.repository.claimNextQueuedJob(now.toISOString())
    if (!job) return null
    this.audit.record({
      siteId: job.siteId,
      actorType: 'backup-worker',
      actorIdentifier: this.workerId,
      eventType: 'backup.job.claimed',
      metadata: { jobId: job.id, backupId: job.backupId, attempt: job.attemptCount }
    })

    const heartbeat = setInterval(() => {
      try {
        this.repository.heartbeatJob(job.id, job.claimToken, new Date().toISOString())
      } catch {
        // The main execution path will surface persistent database failures.
      }
    }, 15_000)
    heartbeat.unref()

    let workDirectory: string | null = null
    try {
      await mkdir(resolve(this.settings.tempRoot), { recursive: true, mode: 0o700 })
      workDirectory = await mkdtemp(join(resolve(this.settings.tempRoot), 'apsc-backup-'))
      const artifact = this.requiredArtifact(job.backupId)
      const site = this.sites.findById(job.siteId)
      const policy = this.repository.getPolicy(job.siteId)
      const connection = this.repository.getConnection(job.siteId)
      if (!site || !policy || !connection) throw new Error('Backup job configuration is incomplete.')
      if (!policy.enabled) throw new Error('Backup policy is disabled.')
      if (connection.connectionType !== 'local-vps') throw new Error('Only Local VPS backup execution is supported.')
      if (policy.storageProvider !== 'dropbox') throw new Error('Only Dropbox backup storage is supported.')
      const local = new LocalVpsConnection(this.settings.allowedLocalBaseDirectories)
      if (!connection.localPath) throw new Error('Local WordPress path is not configured.')
      const wordpressPath = local.validatePath(connection.localPath)
      await local.validateTreeHasNoSymlinks(wordpressPath)

      const built: BuiltBackupArtifact[] = []
      if (policy.filesEnabled) {
        built.push(await this.builder.createFilesArchive(wordpressPath, workDirectory))
        await local.validateTreeHasNoSymlinks(wordpressPath)
        this.record(job, 'backup.files-archive.created', { archiveName: built.at(-1)?.archiveName })
      }
      if (policy.databaseEnabled) {
        const database = this.databaseConfiguration(connection)
        built.push(await this.builder.createDatabaseArchive(database, workDirectory))
        this.record(job, 'backup.database-dump.created', { included: true })
      }
      if (!built.length) throw new Error('Backup policy does not include files or database.')

      const domain = new URL(site.url).hostname
      const manifestBase: Omit<BackupManifest, 'includedArtifacts' | 'archiveNames'> = {
        backupVersion: 1,
        siteId: site.id,
        siteDomain: domain,
        backupId: artifact.id,
        backupTimestamp: artifact.startedAt,
        wordpressPath,
        ...(policy.databaseEnabled && connection.databaseName ? { databaseName: connection.databaseName } : {}),
        includedPaths: policy.filesEnabled ? [wordpressPath] : [],
        excludedPaths: policy.filesEnabled ? [...FILE_BACKUP_EXCLUSIONS] : [],
        storageProvider: 'dropbox',
        storagePath: artifact.storagePath
      }
      const packageFiles = await this.builder.writeManifestAndChecksums(workDirectory, manifestBase, built)
      const checksumFile = packageFiles.files.find(file => file.type === 'checksums')
      if (!checksumFile) throw new Error('Checksum artifact was not created.')
      this.repository.updateArtifact({
        ...artifact,
        filesIncluded: policy.filesEnabled,
        databaseIncluded: policy.databaseEnabled,
        checksum: checksumFile.checksumSha256,
        checksumVerifiedAt: new Date().toISOString(),
        manifest: packageFiles.manifest,
        manifestPath: this.storage.destinationPath(artifact.storagePath, 'manifest.json')
      })

      let totalSize = 0
      for (const file of packageFiles.files) {
        this.repository.heartbeatJob(job.id, job.claimToken, new Date().toISOString())
        const result = await this.storage.upload(file.path, this.storage.destinationPath(artifact.storagePath, file.archiveName))
        if (!result.verified) throw new Error(`Dropbox upload verification failed for ${file.archiveName}.`)
        totalSize += file.sizeBytes
      }
      this.record(job, 'backup.dropbox-upload.completed', { fileCount: packageFiles.files.length, sizeBytes: totalSize })
      this.record(job, 'backup.dropbox-upload.verified', { fileCount: packageFiles.files.length })

      const completedAt = new Date().toISOString()
      this.repository.updateArtifact({
        ...this.requiredArtifact(job.backupId),
        status: 'completed',
        sizeBytes: totalSize,
        completedAt,
        uploadVerifiedAt: completedAt,
        errorMessage: null
      })
      this.repository.finishJob(job.id, job.claimToken, 'completed', null, completedAt)
      this.record(job, 'backup.completed', { sizeBytes: totalSize })
      return this.repository.getJob(job.id)
    } catch (error) {
      const message = safeFailureMessage(error)
      const failedAt = new Date().toISOString()
      const artifact = this.repository.getArtifact(job.backupId)
      if (artifact) {
        this.repository.updateArtifact({ ...artifact, status: 'failed', completedAt: failedAt, errorMessage: message })
      }
      try {
        this.repository.finishJob(job.id, job.claimToken, 'failed', message, failedAt)
      } catch {
        // A stale-claim recovery may already have finalized this job.
      }
      this.record(job, 'backup.failed', { failure: message })
      return this.repository.getJob(job.id)
    } finally {
      clearInterval(heartbeat)
      if (workDirectory) await rm(workDirectory, { recursive: true, force: true })
    }
  }

  private requiredArtifact(backupId: string): BackupArtifact {
    const artifact = this.repository.getArtifact(backupId)
    if (!artifact) throw new Error('Backup artifact was not found.')
    return artifact
  }

  private databaseConfiguration(connection: HostingConnection) {
    const ciphertext = this.repository.getDatabasePasswordCiphertext(connection.siteId)
    if (!connection.databaseConfigured || !connection.databaseHost || !connection.databasePort
      || !connection.databaseName || !connection.databaseUsername || !ciphertext) {
      throw new Error('Database backup credentials are unavailable.')
    }
    return {
      host: connection.databaseHost,
      port: connection.databasePort,
      name: connection.databaseName,
      username: connection.databaseUsername,
      password: decryptSecret(ciphertext, this.settings.credentialEncryptionKey)
    }
  }

  private record(job: BackupJob, eventType: string, metadata: Record<string, unknown>): void {
    this.audit.record({
      siteId: job.siteId,
      actorType: 'backup-worker',
      actorIdentifier: this.workerId,
      eventType,
      metadata: { jobId: job.id, backupId: job.backupId, ...metadata }
    })
  }
}

function safeFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Backup execution failed.'
  return message
    .replace(/password\s*=\s*\S+/gi, 'password=[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]')
    .slice(0, 500)
}
