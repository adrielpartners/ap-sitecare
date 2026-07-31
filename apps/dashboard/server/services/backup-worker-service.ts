import { hostname } from 'node:os'
import { join, resolve } from 'node:path'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { BackupArtifact, BackupJob, BackupManifest, HostingConnection } from '../domain/types'
import { BackupArtifactBuilder, FILE_BACKUP_EXCLUSIONS, type BuiltBackupArtifact } from '../backups/backup-artifact-builder'
import { DropboxStorageProvider } from '../backups/dropbox-storage-provider'
import { LocalVpsConnection } from '../backups/local-vps-connection'
import { BackupRepository } from '../repositories/backup-repository'
import { SiteRepository } from '../repositories/site-repository'
import { decryptSecret } from '../utils/credential-crypto'
import { AuditService } from './audit-service'
import { BackupDestinationService } from './backup-destination-service'
import { EntitlementService } from './entitlement-service'
import { SshSftpConnection } from '../backups/ssh-sftp-connection'
import { NotificationService } from './notification-service'

interface BackupWorkerEntitlementGate {
  assertCapability(siteId: string, capability: 'long-term-backups'): Promise<unknown>
}

export interface BackupWorkerSettings {
  allowedLocalBaseDirectories: string[]
  credentialEncryptionKey: string
  dropboxAccessToken: string
  dropboxRefreshToken?: string
  dropboxAppKey?: string
  dropboxAppSecret?: string
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
      settings.dropboxRefreshToken ? '' : settings.dropboxAccessToken,
      settings.dropboxBackupRoot,
      settings.dropboxAccountLabel,
      settings.dropboxEnabled,
      settings.dropboxRefreshToken ? 'oauth' : settings.dropboxTokenStrategy,
      fetch,
      settings.dropboxRefreshToken
        ? {
            appKey: settings.dropboxAppKey ?? '',
            appSecret: settings.dropboxAppSecret ?? '',
            refreshToken: settings.dropboxRefreshToken
          }
        : undefined
    ),
    private readonly destinationService?: BackupDestinationService,
    private readonly entitlements: BackupWorkerEntitlementGate = new EntitlementService(repository.getDatabase()),
    private readonly notifications = new NotificationService(repository.getDatabase())
  ) {}

  async runNext(): Promise<BackupJob | null> {
    const now = new Date()
    const staleBefore = new Date(now.getTime() - this.settings.staleAfterMinutes * 60_000).toISOString()
    for (const stale of await this.repository.failStaleJobs(staleBefore, now.toISOString())) {
      await this.record(stale, 'backup.failed', { failure: stale.errorMessage })
    }
    const job = await this.repository.claimNextQueuedJob(now.toISOString())
    if (!job) return null
    await this.audit.record({
      siteId: job.siteId,
      actorType: 'backup-worker',
      actorIdentifier: this.workerId,
      eventType: 'backup.job.claimed',
      metadata: { jobId: job.id, backupId: job.backupId, attempt: job.attemptCount }
    })

    const heartbeat = setInterval(() => {
      void this.repository
        .heartbeatJob(job.id, job.claimToken, new Date().toISOString())
        .catch(() => {
          // The main execution path will surface persistent database failures.
        })
    }, 15_000)
    heartbeat.unref()

    let workDirectory: string | null = null
    try {
      await this.entitlements.assertCapability(job.siteId, 'long-term-backups')
      await mkdir(resolve(this.settings.tempRoot), { recursive: true, mode: 0o700 })
      workDirectory = await mkdtemp(join(resolve(this.settings.tempRoot), 'apsc-backup-'))
      const [artifact, site, connection] = await Promise.all([
        this.requiredArtifact(job.backupId),
        this.sites.findById(job.siteId),
        this.repository.getConnection(job.siteId)
      ])
      if (!site || !connection) throw new Error('Backup job configuration is incomplete.')
      const local = new LocalVpsConnection(this.settings.allowedLocalBaseDirectories)
      let wordpressPath = connection.localPath ?? ''
      const packagePrefix = artifact.packagePrefix ?? `${new URL(site.url).hostname}_${artifact.id}`
      let ssh: { adapter: SshSftpConnection, privateKey: string } | null = null
      if (connection.connectionType === 'local-vps') {
        if (artifact.filesIncluded) {
          if (!connection.localPath) throw new Error('Local WordPress path is not configured.')
          wordpressPath = local.validatePath(connection.localPath)
          await local.validateTreeHasNoSymlinks(wordpressPath)
        }
      } else if (connection.connectionType === 'ssh-sftp') {
        if (connection.connectionStatus !== 'ready') throw new Error('Hostinger SSH/SFTP source has not passed its connection test.')
        const ciphertext = await this.repository.getSourceCredentialCiphertext(connection.siteId)
        if (!ciphertext) throw new Error('Hostinger SSH private key is unavailable.')
        ssh = {
          adapter: new SshSftpConnection(),
          privateKey: decryptSecret(ciphertext, this.settings.credentialEncryptionKey)
        }
        wordpressPath = connection.remoteRootPath ?? ''
      } else if (connection.connectionType !== 'database-credentials') {
        throw new Error('The configured hosting source does not have an executable backup adapter.')
      }

      const built: BuiltBackupArtifact[] = []
      if (artifact.filesIncluded) {
        let archiveSource = wordpressPath
        if (ssh) {
          archiveSource = join(workDirectory, 'wordpress-source')
          await ssh.adapter.downloadWordPress(connection, ssh.privateKey, workDirectory, archiveSource)
          await local.validateTreeHasNoSymlinks(archiveSource)
        }
        built.push(await this.builder.createFilesArchive(archiveSource, workDirectory, packagePrefix))
        await local.validateTreeHasNoSymlinks(archiveSource)
        await this.record(job, 'backup.files-archive.created', { archiveName: built.at(-1)?.archiveName })
      }
      if (artifact.databaseIncluded) {
        if (ssh) {
          const sqlPath = join(workDirectory, `${packagePrefix}_wordpress-database.sql`)
          await ssh.adapter.exportDatabase(connection, ssh.privateKey, workDirectory, sqlPath)
          built.push(await this.builder.createDatabaseArchiveFromSql(sqlPath))
        } else {
          const database = await this.databaseConfiguration(connection)
          built.push(await this.builder.createDatabaseArchive(database, workDirectory, packagePrefix))
        }
        await this.record(job, 'backup.database-dump.created', { included: true })
      }
      if (!built.length) throw new Error('Backup job does not include files or database.')

      const domain = new URL(site.url).hostname
      const manifestBase: Omit<BackupManifest, 'includedArtifacts' | 'archiveNames'> = {
        backupVersion: 2,
        siteId: site.id,
        siteDomain: domain,
        backupId: artifact.id,
        backupTimestamp: artifact.startedAt,
        wordpressPath,
        ...(artifact.databaseIncluded && connection.databaseName ? { databaseName: connection.databaseName } : {}),
        includedPaths: artifact.filesIncluded ? [wordpressPath] : [],
        excludedPaths: artifact.filesIncluded ? [...FILE_BACKUP_EXCLUSIONS] : [],
        storageProvider: 'dropbox',
        storagePath: artifact.storagePath,
        clientFolder: artifact.clientFolder ?? site.name,
        expiresAt: artifact.expiresAt ?? new Date(Date.now() + 24 * 30 * 86_400_000).toISOString(),
        restoreInstructions: 'Use the included RESTORE.md checklist. Restoration must be supervised by a technician.'
      }
      const packageFiles = await this.builder.writeManifestAndChecksums(workDirectory, manifestBase, built, packagePrefix)
      const checksumFile = packageFiles.files.find(file => file.type === 'checksums')
      if (!checksumFile) throw new Error('Checksum artifact was not created.')
      const storages = await this.resolveStorages(job)
      const primaryStorage = storages[0]?.storage ?? this.storage
      await this.repository.updateArtifact({
        ...artifact,
        filesIncluded: artifact.filesIncluded,
        databaseIncluded: artifact.databaseIncluded,
        checksum: checksumFile.checksumSha256,
        checksumVerifiedAt: new Date().toISOString(),
        manifest: packageFiles.manifest,
        manifestPath: primaryStorage.destinationPath(artifact.storagePath, packageFiles.files.find(file => file.type === 'manifest')!.archiveName)
      })

      let totalSize = 0
      for (const destination of storages) {
        if (!artifact.clientFolder) throw new Error('Stable client backup folder was not recorded.')
        const destinationRoot = destination.storage.artifactPath(artifact.clientFolder, artifact.id, artifact.startedAt)
        for (const file of packageFiles.files) {
          await this.repository.heartbeatJob(job.id, job.claimToken, new Date().toISOString())
          const objectPath = destination.storage.destinationPath(destinationRoot, file.archiveName)
          const result = await destination.storage.upload(file.path, objectPath)
          if (!result.verified) throw new Error(`Dropbox upload verification failed for ${file.archiveName}.`)
          const verifiedAt = new Date().toISOString()
          await this.repository.saveArtifactObject({
            id: randomUUID(),
            backupId: artifact.id,
            destinationId: destination.id,
            artifactType: file.type,
            objectPath: result.path,
            archiveName: file.archiveName,
            sizeBytes: file.sizeBytes,
            checksumSha256: file.checksumSha256,
            uploadStatus: 'verified',
            uploadedAt: verifiedAt,
            verifiedAt,
            deletedAt: null,
            errorMessage: null,
            createdAt: verifiedAt,
            updatedAt: verifiedAt
          })
        }
        await this.record(job, 'backup.dropbox-upload.completed', { destinationId: destination.id, fileCount: packageFiles.files.length })
        await this.record(job, 'backup.dropbox-upload.verified', { destinationId: destination.id, fileCount: packageFiles.files.length })
      }
      totalSize = packageFiles.files.reduce((sum, file) => sum + file.sizeBytes, 0)

      const completedAt = new Date().toISOString()
      const completedArtifact = {
        ...await this.requiredArtifact(job.backupId),
        status: 'completed',
        sizeBytes: totalSize,
        completedAt,
        uploadVerifiedAt: completedAt,
        errorMessage: null
      } satisfies BackupArtifact
      await this.repository.finishExecution(completedArtifact, job.id, job.claimToken, 'completed', null, completedAt)
      await this.record(job, 'backup.completed', { sizeBytes: totalSize })
      await this.notifyCompleted(job, site.name, await this.requiredArtifact(job.backupId), totalSize).catch(async (error) => {
        await this.record(job, 'backup.notification.failed', { failure: safeFailureMessage(error), notificationType: 'success' })
      })
      return this.repository.getJob(job.id)
    } catch (error) {
      const message = safeFailureMessage(error)
      const failedAt = new Date().toISOString()
      const artifact = await this.repository.getArtifact(job.backupId)
      if (artifact) {
        try {
          await this.repository.finishExecution(
            { ...artifact, status: 'failed', completedAt: failedAt, errorMessage: message },
            job.id,
            job.claimToken,
            'failed',
            message,
            failedAt
          )
        } catch {
          // A stale-claim recovery may already have finalized this job.
        }
      }
      await this.record(job, 'backup.failed', { failure: message })
      await this.notifyFailed(job, message).catch(async (error) => {
        await this.record(job, 'backup.notification.failed', { failure: safeFailureMessage(error), notificationType: 'failure' })
      })
      return this.repository.getJob(job.id)
    } finally {
      clearInterval(heartbeat)
      if (workDirectory) await rm(workDirectory, { recursive: true, force: true })
    }
  }

  private async requiredArtifact(backupId: string): Promise<BackupArtifact> {
    const artifact = await this.repository.getArtifact(backupId)
    if (!artifact) throw new Error('Backup artifact was not found.')
    return artifact
  }

  private async databaseConfiguration(connection: HostingConnection) {
    const ciphertext = await this.repository.getDatabasePasswordCiphertext(connection.siteId)
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

  private async resolveStorages(job: BackupJob): Promise<Array<{ id: string, storage: DropboxStorageProvider }>> {
    const destinationIds = await this.repository.getJobDestinationIds(job.id)
    if (!this.destinationService || !destinationIds.length) return [{ id: 'runtime-dropbox', storage: this.storage }]
    const destinations = await this.destinationService.list()
    return Promise.all(destinationIds.map(async (id) => {
      const destination = destinations.find(item => item.id === id)
      if (!destination) throw new Error('A queued backup destination is no longer available.')
      return { id, storage: await this.destinationService!.dropbox(destination) }
    }))
  }

  private async notifyCompleted(job: BackupJob, siteName: string, artifact: BackupArtifact, sizeBytes: number): Promise<void> {
    const completedAt = artifact.completedAt ?? new Date().toISOString()
    await this.notifications.enqueueForSite(
      job.siteId,
      'backup',
      `backup-completed:${artifact.id}`,
      {
        subject: `SiteCare backup completed: ${siteName}`,
        textContent: [
          `The SiteCare long-term backup for ${siteName} completed successfully.`,
          `Backup ID: ${artifact.id}`,
          `Completed: ${completedAt}`,
          `Size: ${sizeBytes} bytes`,
          `Retention expires: ${artifact.expiresAt ?? 'Not recorded'}`
        ].join('\n'),
        htmlContent: `<p>The SiteCare long-term backup for <strong>${escapeHtml(siteName)}</strong> completed successfully.</p><p>Backup ID: ${escapeHtml(artifact.id)}<br>Completed: ${escapeHtml(completedAt)}<br>Size: ${sizeBytes} bytes<br>Retention expires: ${escapeHtml(artifact.expiresAt ?? 'Not recorded')}</p>`
      },
      {
        messageType: 'backup-completed',
        templateKey: 'backup-completed',
        metadata: { backupId: artifact.id, sizeBytes, status: 'completed' },
        artifactReference: artifact.id
      }
    )
  }

  private async notifyFailed(job: BackupJob, failure: string): Promise<void> {
    const site = await this.sites.findById(job.siteId)
    const name = site?.name ?? job.siteId
    await this.notifications.enqueueForSite(
      job.siteId,
      'backup',
      `backup-failed:${job.backupId}:${job.attemptCount}`,
      {
        subject: `SiteCare backup failed: ${name}`,
        textContent: `The SiteCare long-term backup for ${name} failed.\nBackup ID: ${job.backupId}\nReason: ${failure}`,
        htmlContent: `<p>The SiteCare long-term backup for <strong>${escapeHtml(name)}</strong> failed.</p><p>Backup ID: ${escapeHtml(job.backupId)}<br>Reason: ${escapeHtml(failure)}</p>`
      },
      {
        messageType: 'backup-failed',
        templateKey: 'backup-failed',
        metadata: { backupId: job.backupId, status: 'failed' },
        artifactReference: job.backupId
      }
    )
  }

  private async record(job: BackupJob, eventType: string, metadata: Record<string, unknown>): Promise<void> {
    await this.audit.record({
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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
