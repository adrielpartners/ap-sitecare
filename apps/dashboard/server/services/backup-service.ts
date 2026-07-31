import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type {
  BackupArtifact,
  BackupFrequency,
  BackupPolicy,
  HostingConnection,
  HostingConnectionType,
  RestoreCapability,
  StorageProviderType
} from '../domain/types'
import { DropboxStorageProvider } from '../backups/dropbox-storage-provider'
import type { HostingConnectionAdapter, HostingConnectionAssessment } from '../backups/hosting-connection'
import { LocalVpsConnection } from '../backups/local-vps-connection'
import { PlaceholderHostingConnection } from '../backups/placeholder-hosting-connections'
import { BackupRepository } from '../repositories/backup-repository'
import { encryptSecret } from '../utils/credential-crypto'
import { AuditService } from './audit-service'
import { SiteService } from './site-service'
import { BackupDestinationService } from './backup-destination-service'
import { BackupDestinationRepository } from '../repositories/backup-destination-repository'
import { EntitlementService } from './entitlement-service'
import { SshSftpConnection } from '../backups/ssh-sftp-connection'
import { decryptSecret } from '../utils/credential-crypto'
import { HostingerRepository } from '../repositories/hostinger-repository'
import { DatabaseCredentialsConnection } from '../backups/database-credentials-connection'

interface LongTermBackupEntitlementGate {
  assertCapability(siteId: string, capability: 'long-term-backups'): Promise<unknown>
}

const frequencies: BackupFrequency[] = ['daily', 'weekly', 'monthly']
const providers: StorageProviderType[] = ['dropbox', 's3-compatible', 'google-drive', 'local-filesystem', 'backblaze-b2']
const connectionTypes: HostingConnectionType[] = ['local-vps', 'ssh-sftp', 'sftp-only', 'database-credentials', 'hosting-api', 'manual-unsupported']

export interface BackupRuntimeSettings {
  dropboxAccessToken: string
  dropboxRefreshToken?: string
  dropboxAppKey?: string
  dropboxAppSecret?: string
  dropboxRedirectUri?: string
  dropboxBackupRoot: string
  dropboxAccountLabel: string
  dropboxEnabled: boolean
  dropboxTokenStrategy: 'runtime-access-token' | 'oauth'
  allowedLocalBaseDirectories: string[]
  credentialEncryptionKey: string
  tempRoot?: string
}

export interface UpdateBackupPolicyInput {
  enabled: boolean
  frequency: BackupFrequency
  filesEnabled: boolean
  databaseEnabled: boolean
  storageProvider: StorageProviderType
  keepDaily: number
  keepWeekly: number
  keepMonthly: number
  autoDeleteExpired: boolean
  restoreEnabled: boolean
  restoreRequiresConfirmation: boolean
  notes?: string | null
  connectionType: HostingConnectionType
  localPath?: string | null
  databaseConfigured: boolean
  databaseHost?: string | null
  databasePort?: number | null
  databaseName?: string | null
  databaseUsername?: string | null
  databasePassword?: string | null
  providerLabel?: string | null
  connectionNotes?: string | null
  remoteHost?: string | null
  remotePort?: number | null
  remoteUsername?: string | null
  remoteRootPath?: string | null
  sshPrivateKey?: string | null
  hostKey?: string | null
}

export interface DetectedBackupSourceInput {
  wordpressPath: string | null
  databaseHost: string | null
  databasePort: number | null
  databaseName: string | null
  databaseUsername: string | null
  databasePassword: string | null
  providerLabel: string | null
  detectedAt: string | null
}

export class BackupService {
  constructor(
    private readonly settings: BackupRuntimeSettings,
    private readonly repository = new BackupRepository(),
    private readonly siteService = new SiteService(),
    private readonly auditService = new AuditService(),
    private readonly destinationService = new BackupDestinationService(settings, new BackupDestinationRepository(repository.getDatabase()), auditService, siteService),
    private readonly entitlements: LongTermBackupEntitlementGate = new EntitlementService(repository.getDatabase())
  ) {}

  async listPolicies(siteIds: string[] | null = null): Promise<Array<{ site: { id: string, name: string, url: string }, policy: BackupPolicy | null, connection: HostingConnection | null, restoreCapability: RestoreCapability, latestBackup: BackupArtifact | null }>> {
    const sites = await this.siteService.list(siteIds)
    return Promise.all(sites.map(async (site) => {
      const [connection, policy, artifacts] = await Promise.all([
        this.repository.getConnection(site.id),
        this.repository.getPolicy(site.id),
        this.repository.listArtifacts(site.id)
      ])
      return {
        site: { id: site.id, name: site.name, url: site.url },
        policy,
        connection,
        restoreCapability: connection ? this.assessConnection(connection).restoreCapability : 'unsupported',
        latestBackup: artifacts[0] ?? null
      }
    }))
  }

  async getSiteOverview(siteId: string) {
    const [site, policy, connection, backups, destinations, destinationSettings, restorePlans, entitlement, hostinger] = await Promise.all([
      this.siteService.get(siteId),
      this.repository.getPolicy(siteId),
      this.repository.getConnection(siteId),
      this.repository.listArtifacts(siteId),
      this.destinationService.list(),
      this.destinationService.getSiteSettings(siteId),
      this.repository.listRestorePlans(siteId),
      this.entitlementOverview(siteId),
      new HostingerRepository(this.repository.getDatabase()).findBySiteId(siteId)
    ])
    const assessment = connection ? this.assessConnection(connection) : this.unsupportedAssessment()
    return {
      site: { id: site.id, name: site.name, url: site.url },
      policy,
      connection,
      connectionAssessment: assessment,
      storage: this.dropbox().configuration(),
      destinations,
      destinationSettings,
      entitlement,
      hostingerDailyBackup: hostinger,
      latestBackup: backups[0] ?? null,
      latestSuccessfulBackup: backups.find(backup => backup.status === 'completed') ?? null,
      recentFailedBackups: backups.filter(backup => backup.status === 'failed').slice(0, 10),
      nextScheduledBackup: policy?.enabled ? policy.nextDueAt ?? this.nextScheduled(policy.frequency) : null,
      backups,
      restorePlans
    }
  }

  async updatePolicy(siteId: string, input: UpdateBackupPolicyInput, actorIdentifier: string) {
    await this.siteService.get(siteId)
    if (input.enabled) await this.entitlements.assertCapability(siteId, 'long-term-backups')
    this.validateInput(input)
    const [existingPolicy, existingConnection, existingPasswordCiphertext, existingSourceCredentialCiphertext] = await Promise.all([
      this.repository.getPolicy(siteId),
      this.repository.getConnection(siteId),
      this.repository.getDatabasePasswordCiphertext(siteId),
      this.repository.getSourceCredentialCiphertext(siteId)
    ])
    const now = new Date().toISOString()
    const databaseHost = this.optional(input.databaseHost)
    const databaseName = this.optional(input.databaseName)
    const databaseUsername = this.optional(input.databaseUsername)
    const databasePort = input.databasePort ?? 3306
    if (!Number.isInteger(databasePort) || databasePort < 1 || databasePort > 65535) {
      throw new Error('Database port must be between 1 and 65535.')
    }
    const databasePasswordCiphertext = input.databasePassword
      ? encryptSecret(input.databasePassword, this.settings.credentialEncryptionKey)
      : existingPasswordCiphertext
    const sourceCredentialCiphertext = input.sshPrivateKey
      ? encryptSecret(input.sshPrivateKey, this.settings.credentialEncryptionKey)
      : existingSourceCredentialCiphertext
    const databaseConfigured = Boolean(databaseHost && databaseName && databaseUsername && databasePasswordCiphertext)
    const remoteHost = this.optional(input.remoteHost)
    const remoteUsername = this.optional(input.remoteUsername)
    const remoteRootPath = this.optional(input.remoteRootPath)
    const remotePort = input.remotePort ?? (input.connectionType === 'ssh-sftp' ? 65002 : null)
    const sourceChanged = Boolean(input.sshPrivateKey)
      || remoteHost !== existingConnection?.remoteHost
      || remotePort !== existingConnection?.remotePort
      || remoteUsername !== existingConnection?.remoteUsername
      || remoteRootPath !== existingConnection?.remoteRootPath
      || this.optional(input.hostKey) !== existingConnection?.hostKey
    const connection: HostingConnection = {
      siteId,
      connectionType: input.connectionType,
      localPath: this.optional(input.localPath),
      databaseConfigured,
      databaseHost,
      databasePort: databaseConfigured ? databasePort : null,
      databaseName,
      databaseUsername,
      remoteHost,
      remotePort,
      remoteUsername,
      remoteRootPath,
      authenticationType: input.connectionType === 'ssh-sftp' ? 'ssh-private-key' : 'none',
      credentialConfigured: Boolean(sourceCredentialCiphertext),
      credentialVersion: (existingConnection?.credentialVersion ?? 0) + (input.sshPrivateKey ? 1 : 0),
      hostKey: this.optional(input.hostKey),
      connectionStatus: input.connectionType === 'local-vps'
        ? 'quarantined'
        : sourceChanged ? 'not-tested' : existingConnection?.connectionStatus ?? 'not-tested',
      lastTestedAt: sourceChanged ? null : existingConnection?.lastTestedAt ?? null,
      lastErrorCode: input.connectionType === 'local-vps' ? 'legacy-local-source' : sourceChanged ? null : existingConnection?.lastErrorCode ?? null,
      lastErrorMessage: input.connectionType === 'local-vps'
        ? 'Local paths are quarantined unless the WordPress files are explicitly mounted into the backup worker.'
        : sourceChanged ? null : existingConnection?.lastErrorMessage ?? null,
      providerLabel: this.optional(input.providerLabel),
      notes: this.optional(input.connectionNotes),
      createdAt: existingConnection?.createdAt ?? now,
      updatedAt: now
    }
    const assessment = this.assessConnection(connection)
    if (connection.connectionType === 'local-vps' && connection.localPath) {
      new LocalVpsConnection(this.settings.allowedLocalBaseDirectories).validatePath(connection.localPath)
    }
    const policy: BackupPolicy = {
      siteId,
      enabled: input.enabled,
      frequency: input.frequency,
      filesEnabled: input.filesEnabled,
      databaseEnabled: input.databaseEnabled,
      storageProvider: input.storageProvider,
      retention: {
        keepDaily: input.keepDaily,
        keepWeekly: input.keepWeekly,
        keepMonthly: input.keepMonthly,
        autoDeleteExpired: input.autoDeleteExpired
      },
      restoreEnabled: input.restoreEnabled,
      restoreRequiresConfirmation: true,
      retentionMonths: 24,
      nextDueAt: existingPolicy?.nextDueAt ?? (input.enabled ? now : null),
      lastScheduledPeriod: existingPolicy?.lastScheduledPeriod ?? null,
      notes: this.optional(input.notes),
      createdAt: existingPolicy?.createdAt ?? now,
      updatedAt: now
    }
    await this.repository.savePolicyAndConnection(
      policy,
      connection,
      databasePasswordCiphertext,
      sourceCredentialCiphertext
    )
    await this.auditService.record({
      siteId,
      actorType: 'dashboard-user',
      actorIdentifier,
      eventType: 'backup.policy.updated',
      metadata: {
        enabled: policy.enabled,
        frequency: policy.frequency,
        storageProvider: policy.storageProvider,
        connectionType: connection.connectionType,
        restoreCapability: assessment.restoreCapability
      }
    })
    return { policy, connection, connectionAssessment: assessment }
  }

  async recordDetectedBackupSource(siteId: string, input: DetectedBackupSourceInput): Promise<HostingConnection> {
    await this.siteService.get(siteId)
    const [existing, existingPasswordCiphertext] = await Promise.all([
      this.repository.getConnection(siteId),
      this.repository.getDatabasePasswordCiphertext(siteId)
    ])
    if (existing?.connectionType === 'ssh-sftp' && existing.connectionStatus === 'ready') {
      return existing
    }
    const now = new Date().toISOString()
    const databaseHost = this.optional(input.databaseHost)
    const databaseName = this.optional(input.databaseName)
    const databaseUsername = this.optional(input.databaseUsername)
    const databasePort = input.databasePort ?? 3306
    this.validateDatabaseValue(databaseHost, /^[a-zA-Z0-9._:-]+$/, 'Database host')
    this.validateDatabaseValue(databaseName, /^[a-zA-Z0-9_$.-]+$/, 'Database name')
    this.validateDatabaseValue(databaseUsername, /^[a-zA-Z0-9_.@-]+$/, 'Database username')
    const databasePasswordCiphertext = input.databasePassword
      ? encryptSecret(input.databasePassword, this.settings.credentialEncryptionKey)
      : existingPasswordCiphertext
    const databaseConfigured = Boolean(databaseHost && databaseName && databaseUsername && databasePasswordCiphertext)
    const connection: HostingConnection = {
      siteId,
      connectionType: 'database-credentials',
      localPath: this.optional(input.wordpressPath),
      databaseConfigured,
      databaseHost,
      databasePort: databaseConfigured ? databasePort : null,
      databaseName,
      databaseUsername,
      remoteHost: existing?.remoteHost ?? null,
      remotePort: existing?.remotePort ?? null,
      remoteUsername: existing?.remoteUsername ?? null,
      remoteRootPath: existing?.remoteRootPath ?? null,
      authenticationType: existing?.authenticationType ?? 'none',
      credentialConfigured: existing?.credentialConfigured ?? false,
      credentialVersion: existing?.credentialVersion ?? 0,
      hostKey: existing?.hostKey ?? null,
      connectionStatus: databaseConfigured ? 'ready' : 'not-tested',
      lastTestedAt: databaseConfigured ? now : null,
      lastErrorCode: null,
      lastErrorMessage: input.wordpressPath
        ? 'The WordPress path reported by the plugin is informational and is not readable by the remote backup worker.'
        : null,
      providerLabel: this.optional(input.providerLabel) ?? existing?.providerLabel ?? 'WordPress plugin',
      notes: `Detected automatically by the WordPress plugin${input.detectedAt ? ` at ${input.detectedAt}` : ''}.`,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }
    await this.repository.saveConnection(
      connection,
      databasePasswordCiphertext,
      await this.repository.getSourceCredentialCiphertext(siteId)
    )
    return connection
  }

  async planManualBackup(siteId: string, actorIdentifier: string) {
    return this.queueBackup(siteId, actorIdentifier, 'manual', new Date())
  }

  async planScheduledBackup(siteId: string, actorIdentifier: string, at = new Date()) {
    const entitlement = await this.entitlements.assertCapability(siteId, 'long-term-backups') as {
      settings?: { longTermBackupRetentionMonths?: number | null }
    }
    let policy = await this.repository.getPolicy(siteId)
    if (!policy) {
      const now = at.toISOString()
      policy = await this.repository.savePolicy({
        siteId,
        enabled: true,
        frequency: 'monthly',
        filesEnabled: true,
        databaseEnabled: true,
        storageProvider: 'dropbox',
        retention: { keepDaily: 0, keepWeekly: 0, keepMonthly: 24, autoDeleteExpired: true },
        restoreEnabled: true,
        restoreRequiresConfirmation: true,
        retentionMonths: entitlement.settings?.longTermBackupRetentionMonths ?? 24,
        nextDueAt: now,
        lastScheduledPeriod: null,
        notes: 'SiteCare Pro default monthly full-site long-term backup policy.',
        createdAt: now,
        updatedAt: now
      })
    }
    if (!policy.enabled) return { skipped: true, reason: 'backup-policy-disabled' }
    const period = monthlyPeriod(at)
    const existing = await this.repository.findScheduledArtifact(siteId, period)
    if (existing) {
      // Repair the policy cursor if a previous request committed the artifact but
      // stopped before advancing the schedule. The artifact is the idempotency
      // record, so this never queues a second backup for the same UTC month.
      if (policy.lastScheduledPeriod !== period || !policy.nextDueAt || new Date(policy.nextDueAt) <= at) {
        const nextDue = new Date(at)
        nextDue.setUTCMonth(nextDue.getUTCMonth() + 1)
        policy = await this.repository.savePolicy({
          ...policy,
          frequency: 'monthly',
          filesEnabled: true,
          databaseEnabled: true,
          retentionMonths: entitlement.settings?.longTermBackupRetentionMonths ?? 24,
          nextDueAt: nextDue.toISOString(),
          lastScheduledPeriod: period,
          updatedAt: at.toISOString()
        })
      }
      return { artifact: existing, job: await this.repository.getJobForBackup(existing.id), duplicate: true }
    }
    if (policy.nextDueAt && new Date(policy.nextDueAt) > at) return { skipped: true, reason: 'not-due', nextDueAt: policy.nextDueAt }
    const queued = await this.queueBackup(siteId, actorIdentifier, 'scheduled', at)
    const nextDue = new Date(at)
    nextDue.setUTCMonth(nextDue.getUTCMonth() + 1)
    await this.repository.savePolicy({
      ...policy,
      frequency: 'monthly',
      filesEnabled: true,
      databaseEnabled: true,
      retentionMonths: entitlement.settings?.longTermBackupRetentionMonths ?? 24,
      nextDueAt: nextDue.toISOString(),
      lastScheduledPeriod: period,
      updatedAt: at.toISOString()
    })
    return { ...queued, duplicate: false }
  }

  async runRetentionDryRun(actorIdentifier: string, at = new Date()) {
    const candidates = await this.repository.listExpiredCandidates(at.toISOString())
    const backupIds = candidates.map(candidate => candidate.id)
    const runId = randomUUID()
    await this.repository.createRetentionDryRun({
      id: runId,
      backupIds,
      requestedBy: actorIdentifier,
      createdAt: at.toISOString()
    })
    const markedCount = await this.repository.markExpirationDue(backupIds, at.toISOString())
    await this.auditService.record({
      actorType: 'automation-worker',
      actorIdentifier,
      eventType: 'backup.retention.dry-run-completed',
      metadata: { runId, candidateCount: backupIds.length, markedCount, deletionEnabled: false }
    })
    return { runId, candidateCount: backupIds.length, markedCount, deletionEnabled: false }
  }

  private async queueBackup(siteId: string, actorIdentifier: string, backupType: 'manual' | 'scheduled', at: Date) {
    await this.entitlements.assertCapability(siteId, 'long-term-backups')
    const overview = await this.getSiteOverview(siteId)
    if (!overview.connection) throw new Error('A hosting connection must be configured before preparing a backup.')
    const assessment = overview.connectionAssessment
    const requested = backupType === 'scheduled'
      ? { filesIncluded: assessment.backupFiles, databaseIncluded: assessment.backupDatabase }
      : this.manualBackupSelection(overview.policy, assessment)
    if (backupType === 'scheduled' && (!requested.filesIncluded || !requested.databaseIncluded)) {
      throw new Error('Scheduled SiteCare Pro backups require a tested source for both full website files and the WordPress database.')
    }
    if (!requested.filesIncluded && !requested.databaseIncluded) {
      throw new Error('The detected source cannot back up files or the database yet.')
    }
    const destinations = await this.destinationService.resolveForSite(siteId)
    if (!destinations.length) throw new Error('No enabled backup destination is configured for this site.')
    if (destinations.some(destination => !destination.executable || !destination.credentialConfigured)) {
      throw new Error('Every selected backup destination must have an executable adapter and configured credential.')
    }

    const backupId = randomUUID()
    const now = at.toISOString()
    const domain = new URL(overview.site.url).hostname
    const primaryDestination = destinations[0]
    if (!primaryDestination) throw new Error('No enabled backup destination is configured for this site.')
    const primaryStorage = await this.destinationService.dropbox(primaryDestination)
    const clientFolder = await this.repository.getOrCreateClientFolder(siteId, safeClientFolder(overview.site.name), now)
    const packagePrefix = backupPackagePrefix(domain, now, backupId)
    const expiresAt = addUtcMonths(at, overview.entitlement?.settings.longTermBackupRetentionMonths ?? 24).toISOString()
    const artifact: BackupArtifact = {
      id: backupId,
      siteId,
      backupType,
      frequency: backupType === 'scheduled' ? 'monthly' : 'manual',
      filesIncluded: requested.filesIncluded,
      databaseIncluded: requested.databaseIncluded,
      storageProvider: primaryDestination.provider,
      storagePath: primaryStorage.artifactPath(clientFolder, backupId, at),
      status: 'queued',
      sizeBytes: null,
      checksum: null,
      startedAt: now,
      completedAt: null,
      expiresAt,
      retentionCategory: backupType === 'scheduled' ? 'monthly' : 'manual',
      clientFolder,
      packagePrefix,
      schedulePeriod: backupType === 'scheduled' ? monthlyPeriod(at) : null,
      retentionState: 'retained',
      expiredAt: null,
      deletedAt: null,
      manifestPath: null,
      manifest: null,
      checksumVerifiedAt: null,
      uploadVerifiedAt: null,
      errorMessage: null
    }
    const job = {
      id: randomUUID(),
      siteId,
      backupId,
      status: 'queued',
      runner: 'background-worker',
      requestedBy: actorIdentifier,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      attemptCount: 0,
      claimedAt: null,
      heartbeatAt: null,
      errorMessage: null
    } satisfies import('../domain/types').BackupJob
    await this.repository.createExecution(artifact, job, destinations.map(destination => destination.id))
    await this.auditService.record({
      siteId,
      actorType: 'dashboard-user',
      actorIdentifier,
      eventType: 'backup.job.queued',
      metadata: { backupId, jobId: job.id, runner: job.runner, destinationCount: destinations.length }
    })
    return {
      artifact,
      job,
      message: artifact.filesIncluded
        ? `${backupType === 'scheduled' ? 'Monthly' : 'Manual'} backup job queued. A separate background worker will execute it.`
        : 'Database backup job queued. File backups will be included after the WordPress path is mounted for the worker.'
    }
  }

  async testStorageProvider(actorIdentifier: string) {
    const result = await this.dropbox().testConnection()
    await this.auditService.record({
      actorType: 'dashboard-user',
      actorIdentifier,
      eventType: 'backup.storage.tested',
      metadata: { provider: result.provider, connected: result.connected }
    })
    return result
  }

  async testHostingConnection(siteId: string, actorIdentifier: string) {
    let connection = await this.repository.getConnection(siteId)
    if (!connection) throw new Error('No hosting connection is configured for this site.')
    if (connection.connectionType === 'ssh-sftp') {
      const ciphertext = await this.repository.getSourceCredentialCiphertext(siteId)
      if (!ciphertext) throw new Error('SSH private key is not configured.')
      const tempRoot = resolve(this.settings.tempRoot ?? '/tmp/ap-sitecare-backups')
      await mkdir(tempRoot, { recursive: true, mode: 0o700 })
      const workDirectory = await mkdtemp(join(tempRoot, 'apsc-source-test-'))
      try {
        const result = await new SshSftpConnection().test(
          connection,
          decryptSecret(ciphertext, this.settings.credentialEncryptionKey),
          workDirectory
        )
        connection = {
          ...connection,
          hostKey: result.hostKey ?? connection.hostKey,
          connectionStatus: 'ready',
          lastTestedAt: new Date().toISOString(),
          lastErrorCode: null,
          lastErrorMessage: null,
          updatedAt: new Date().toISOString()
        }
      } catch (error) {
        connection = {
          ...connection,
          connectionStatus: 'failed',
          lastTestedAt: new Date().toISOString(),
          lastErrorCode: 'ssh-sftp-test-failed',
          lastErrorMessage: safeConnectionFailure(error),
          updatedAt: new Date().toISOString()
        }
      } finally {
        await rm(workDirectory, { recursive: true, force: true })
      }
      await this.repository.saveConnection(
        connection,
        await this.repository.getDatabasePasswordCiphertext(siteId),
        ciphertext
      )
    }
    const assessment = this.assessConnection(connection)
    await this.auditService.record({
      siteId,
      actorType: 'dashboard-user',
      actorIdentifier,
      eventType: 'backup.hosting-connection.tested',
      metadata: {
        connectionType: connection.connectionType,
        connectionStatus: connection.connectionStatus,
        restoreCapability: assessment.restoreCapability
      }
    })
    return assessment
  }

  async verifyBackup(backupId: string, actorIdentifier: string) {
    const artifact = await this.repository.getArtifact(backupId)
    if (!artifact) throw new Error('Backup not found.')
    const checks = {
      completed: artifact.status === 'completed',
      manifestRecorded: Boolean(artifact.manifestPath),
      checksumRecorded: Boolean(artifact.checksum),
      sizeRecorded: artifact.sizeBytes !== null && artifact.sizeBytes > 0,
      checksumsVerified: Boolean(artifact.checksumVerifiedAt),
      uploadVerified: Boolean(artifact.uploadVerifiedAt)
    }
    const verified = Object.values(checks).every(Boolean)
    await this.auditService.record({
      siteId: artifact.siteId,
      actorType: 'dashboard-user',
      actorIdentifier,
      eventType: verified ? 'backup.verified' : 'backup.verification.failed',
      metadata: { backupId, checks }
    })
    return { backupId, verified, checks, message: verified ? 'Recorded backup evidence is complete.' : 'Backup evidence is incomplete.' }
  }

  async getBackupDetails(backupId: string) {
    const artifact = await this.repository.getArtifact(backupId)
    if (!artifact) throw new Error('Backup not found.')
    return {
      artifact,
      job: await this.repository.getJobForBackup(backupId),
      objects: await this.repository.listArtifactObjects(backupId)
    }
  }

  async getDownloadLinks(backupId: string, actorIdentifier: string) {
    const artifact = await this.repository.getArtifact(backupId)
    if (!artifact || artifact.status !== 'completed') throw new Error('A completed backup is required for download.')
    const objects = (await this.repository.listArtifactObjects(backupId))
      .filter(object => object.uploadStatus === 'verified')
    if (!objects.length) throw new Error('Verified backup objects are not available for download.')
    const destinations = await this.destinationService.list()
    const links = []
    for (const object of objects) {
      const destination = destinations.find(item => item.id === object.destinationId)
      if (!destination) continue
      const storage = await this.destinationService.dropbox(destination)
      links.push({
        archiveName: object.archiveName,
        artifactType: object.artifactType,
        sizeBytes: object.sizeBytes,
        checksumSha256: object.checksumSha256,
        expiresInHours: 4,
        url: await storage.temporaryLink(object.objectPath)
      })
    }
    await this.auditService.record({
      siteId: artifact.siteId,
      actorType: 'dashboard-user',
      actorIdentifier,
      eventType: 'restore.download-links.created',
      metadata: { backupId, objectCount: links.length }
    })
    return { backupId, links }
  }

  async getClientSafeManifest(backupId: string) {
    const artifact = await this.repository.getArtifact(backupId)
    if (!artifact) throw new Error('Backup not found.')
    if (!artifact.manifest) throw new Error('Backup manifest is not available.')
    return artifact.manifest
  }

  async retryFailedBackup(backupId: string, actorIdentifier: string) {
    const previous = await this.repository.getArtifact(backupId)
    if (!previous) throw new Error('Backup not found.')
    await this.entitlements.assertCapability(previous.siteId, 'long-term-backups')
    if (previous.status !== 'failed') throw new Error('Only failed backups can be retried.')
    const now = new Date().toISOString()
    const newBackupId = randomUUID()
    const destinations = await this.destinationService.resolveForSite(previous.siteId)
    const primaryDestination = destinations[0]
    if (!primaryDestination) throw new Error('No enabled backup destination is configured for this site.')
    if (destinations.some(destination => !destination.executable || !destination.credentialConfigured)) {
      throw new Error('Every selected backup destination must have an executable adapter and configured credential.')
    }
    const site = await this.siteService.get(previous.siteId)
    const storage = await this.destinationService.dropbox(primaryDestination)
    const domain = new URL(site.url).hostname
    const clientFolder = previous.clientFolder
      ?? await this.repository.getOrCreateClientFolder(previous.siteId, safeClientFolder(site.name), now)
    const artifact = await this.repository.createArtifact({
      ...previous,
      id: newBackupId,
      backupType: 'manual',
      frequency: 'manual',
      storageProvider: primaryDestination.provider,
      storagePath: storage.artifactPath(clientFolder, newBackupId, now),
      status: 'queued',
      sizeBytes: null,
      checksum: null,
      startedAt: now,
      completedAt: null,
      manifestPath: null,
      manifest: null,
      checksumVerifiedAt: null,
      uploadVerifiedAt: null,
      clientFolder,
      packagePrefix: backupPackagePrefix(domain, now, newBackupId),
      schedulePeriod: null,
      retentionState: 'retained',
      expiredAt: null,
      deletedAt: null,
      errorMessage: null
    })
    const job = await this.repository.createJob({
      id: randomUUID(),
      siteId: artifact.siteId,
      backupId: artifact.id,
      status: 'queued',
      runner: 'background-worker',
      requestedBy: actorIdentifier,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      attemptCount: 0,
      claimedAt: null,
      heartbeatAt: null,
      errorMessage: null
    })
    await this.repository.saveJobDestinations(job.id, destinations.map(destination => destination.id))
    await this.auditService.record({
      siteId: artifact.siteId,
      actorType: 'dashboard-user',
      actorIdentifier,
      eventType: 'backup.job.retried',
      metadata: { previousBackupId: backupId, backupId: artifact.id, jobId: job.id }
    })
    return { artifact, job, message: 'A new background backup job was queued from the failed backup.' }
  }

  async prepareRestore(siteId: string, backupId: string, actorIdentifier: string) {
    const [overview, artifact, objects] = await Promise.all([
      this.getSiteOverview(siteId),
      this.repository.getArtifact(backupId),
      this.repository.listArtifactObjects(backupId)
    ])
    if (!artifact || artifact.siteId !== siteId) throw new Error('Backup not found for this site.')
    const capability = overview.connectionAssessment.restoreCapability
    const checks = {
      restoreEnabled: overview.policy?.restoreEnabled === true,
      backupCompleted: artifact.status === 'completed',
      manifestRecorded: Boolean(artifact.manifestPath),
      checksumRecorded: Boolean(artifact.checksum),
      localChecksumsVerified: Boolean(artifact.checksumVerifiedAt),
      remoteUploadsVerified: Boolean(artifact.uploadVerifiedAt),
      portableFilesRecorded: objects.some(object => object.artifactType === 'files' && object.uploadStatus === 'verified'),
      portableDatabaseRecorded: objects.some(object => object.artifactType === 'database' && object.uploadStatus === 'verified'),
      restoreReadmeRecorded: objects.some(object => object.artifactType === 'readme' && object.uploadStatus === 'verified')
    }
    const warnings = [
      'Restoration is supervised. SiteCare will provide verified downloads and a technician checklist, but will not execute an unattended restore.',
      ...Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => `Preflight check failed: ${name}.`)
    ]
    const passed = Object.values(checks).every(Boolean)
    const now = new Date().toISOString()
    const plan = await this.repository.createRestorePlan({
      id: randomUUID(),
      siteId,
      backupId,
      status: passed ? 'preflight-passed' : 'preflight-failed',
      restoreFiles: artifact.filesIncluded,
      restoreDatabase: artifact.databaseIncluded,
      capability,
      preflight: checks,
      warnings,
      confirmationRequired: true,
      checklist: [
        { key: 'download', label: 'Download all portable backup objects', completed: false },
        { key: 'checksums', label: 'Verify every SHA-256 checksum', completed: false },
        { key: 'target-backup', label: 'Back up the current target host before changing it', completed: false },
        { key: 'files', label: 'Extract WordPress files into the target web root', completed: false },
        { key: 'database', label: 'Import the SQL database into the target database', completed: false },
        { key: 'configuration', label: 'Update wp-config.php and URLs when required', completed: false },
        { key: 'validation', label: 'Verify frontend, admin, media, plugins, themes, SSL, and permalinks', completed: false },
        { key: 'record', label: 'Record technician notes, timestamps, target host, and outcome', completed: false }
      ],
      technicianNotes: null,
      targetHostLabel: null,
      downloadVerifiedAt: null,
      restorationStartedAt: null,
      restorationCompletedAt: null,
      completedBy: null,
      outcome: null,
      createdBy: actorIdentifier,
      createdAt: now,
      updatedAt: now
    })
    await this.auditService.record({
      siteId,
      actorType: 'dashboard-user',
      actorIdentifier,
      eventType: passed ? 'restore.plan.created' : 'restore.preflight.failed',
      metadata: { restorePlanId: plan.id, backupId, capability }
    })
    return { plan, executionAvailable: false }
  }

  async recordRestoreOutcome(
    siteId: string,
    planId: string,
    input: {
      completedChecklistKeys: string[]
      technicianNotes: string
      targetHostLabel: string
      outcome: string
      restorationStartedAt?: string | null
      restorationCompletedAt?: string | null
    },
    actorIdentifier: string
  ) {
    const plan = await this.repository.getRestorePlan(siteId, planId)
    if (!plan) throw new Error('Restore plan not found.')
    const completed = new Set(input.completedChecklistKeys)
    if ([...completed].some(key => !plan.checklist.some(item => item.key === key))) {
      throw new Error('Restore checklist contains an unsupported item.')
    }
    const notes = input.technicianNotes.trim()
    const target = input.targetHostLabel.trim()
    const outcome = input.outcome.trim()
    if (!notes || !target || !outcome) throw new Error('Target host, technician notes, and restore outcome are required.')
    const now = new Date().toISOString()
    const updated = await this.repository.updateRestorePlan({
      ...plan,
      checklist: plan.checklist.map(item => ({ ...item, completed: completed.has(item.key) })),
      technicianNotes: notes.slice(0, 10_000),
      targetHostLabel: target.slice(0, 300),
      downloadVerifiedAt: completed.has('download') && completed.has('checksums') ? now : plan.downloadVerifiedAt,
      restorationStartedAt: normalizedOptionalDate(input.restorationStartedAt) ?? plan.restorationStartedAt ?? now,
      restorationCompletedAt: normalizedOptionalDate(input.restorationCompletedAt),
      completedBy: input.restorationCompletedAt ? actorIdentifier : null,
      outcome: outcome.slice(0, 2000),
      updatedAt: now
    })
    await this.auditService.record({
      siteId,
      actorType: 'dashboard-user',
      actorIdentifier,
      eventType: updated.restorationCompletedAt ? 'restore.outcome.recorded' : 'restore.progress.recorded',
      metadata: {
        restorePlanId: plan.id,
        backupId: plan.backupId,
        targetHostLabel: updated.targetHostLabel,
        completedChecklistCount: updated.checklist.filter(item => item.completed).length,
        restorationStartedAt: updated.restorationStartedAt,
        restorationCompletedAt: updated.restorationCompletedAt
      }
    })
    return updated
  }

  private assessConnection(connection: HostingConnection): HostingConnectionAssessment {
    return this.adapter(connection.connectionType).assess(connection)
  }

  private adapter(type: HostingConnectionType): HostingConnectionAdapter {
    if (type === 'local-vps') return new LocalVpsConnection(this.settings.allowedLocalBaseDirectories)
    if (type === 'ssh-sftp') return new SshSftpConnection()
    if (type === 'sftp-only') return new PlaceholderHostingConnection(type, true, false, 'SFTP-only')
    if (type === 'database-credentials') return new DatabaseCredentialsConnection()
    if (type === 'hosting-api') return new PlaceholderHostingConnection(type, false, false, 'Hosting API')
    return new PlaceholderHostingConnection(type, false, false, 'Manual/unsupported')
  }

  private dropbox(): DropboxStorageProvider {
    const oauth = this.settings.dropboxRefreshToken
      ? {
          appKey: this.settings.dropboxAppKey ?? '',
          appSecret: this.settings.dropboxAppSecret ?? '',
          refreshToken: this.settings.dropboxRefreshToken
        }
      : undefined
    return new DropboxStorageProvider(
      oauth ? '' : this.settings.dropboxAccessToken,
      this.settings.dropboxBackupRoot,
      this.settings.dropboxAccountLabel,
      this.settings.dropboxEnabled,
      oauth ? 'oauth' : this.settings.dropboxTokenStrategy,
      fetch,
      oauth
    )
  }

  private unsupportedAssessment(): HostingConnectionAssessment {
    return new PlaceholderHostingConnection('manual-unsupported', false, false, 'Manual/unsupported').assess({
      siteId: '',
      connectionType: 'manual-unsupported',
      localPath: null,
      databaseConfigured: false,
      databaseHost: null,
      databasePort: null,
      databaseName: null,
      databaseUsername: null,
      remoteHost: null,
      remotePort: null,
      remoteUsername: null,
      remoteRootPath: null,
      authenticationType: 'none',
      credentialConfigured: false,
      credentialVersion: 0,
      hostKey: null,
      connectionStatus: 'not-tested',
      lastTestedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      providerLabel: null,
      notes: null,
      createdAt: '',
      updatedAt: ''
    })
  }

  private nextScheduled(frequency: BackupFrequency): string {
    const date = new Date()
    if (frequency === 'daily') date.setUTCDate(date.getUTCDate() + 1)
    if (frequency === 'weekly') date.setUTCDate(date.getUTCDate() + 7)
    if (frequency === 'monthly') date.setUTCMonth(date.getUTCMonth() + 1)
    return date.toISOString()
  }

  private manualBackupSelection(policy: BackupPolicy | null, assessment: HostingConnectionAssessment): { filesIncluded: boolean, databaseIncluded: boolean } {
    if (policy?.enabled) {
      if (!policy.filesEnabled && !policy.databaseEnabled) throw new Error('The backup policy must include files or database.')
      return {
        filesIncluded: policy.filesEnabled && assessment.backupFiles,
        databaseIncluded: policy.databaseEnabled && assessment.backupDatabase
      }
    }

    return {
      filesIncluded: false,
      databaseIncluded: assessment.backupDatabase
    }
  }

  private validateInput(input: UpdateBackupPolicyInput): void {
    if (!frequencies.includes(input.frequency)) throw new Error('Unsupported backup frequency.')
    if (!providers.includes(input.storageProvider)) throw new Error('Unsupported storage provider.')
    if (!connectionTypes.includes(input.connectionType)) throw new Error('Unsupported hosting connection type.')
    for (const value of [input.keepDaily, input.keepWeekly, input.keepMonthly]) {
      if (!Number.isInteger(value) || value < 0 || value > 1000) throw new Error('Retention values must be whole numbers between 0 and 1000.')
    }
    if (input.enabled && !input.filesEnabled && !input.databaseEnabled) throw new Error('An enabled backup policy must include files or database.')
    if (input.databasePort !== null && input.databasePort !== undefined
      && (!Number.isInteger(input.databasePort) || input.databasePort < 1 || input.databasePort > 65535)) {
      throw new Error('Database port must be between 1 and 65535.')
    }
    this.validateDatabaseValue(input.databaseHost, /^[a-zA-Z0-9._:-]+$/, 'Database host')
    this.validateDatabaseValue(input.databaseName, /^[a-zA-Z0-9_$.-]+$/, 'Database name')
    this.validateDatabaseValue(input.databaseUsername, /^[a-zA-Z0-9_.@-]+$/, 'Database username')
    if (input.databaseName?.startsWith('-')) throw new Error('Database name must not start with a hyphen.')
    this.validateDatabaseValue(input.remoteHost, /^[a-zA-Z0-9.-]+$/, 'SSH host')
    this.validateDatabaseValue(input.remoteUsername, /^[a-zA-Z0-9._-]+$/, 'SSH username')
    if (input.remotePort !== null && input.remotePort !== undefined
      && (!Number.isInteger(input.remotePort) || input.remotePort < 1 || input.remotePort > 65535)) {
      throw new Error('SSH port must be between 1 and 65535.')
    }
    if (input.remoteRootPath && (!/^\/[a-zA-Z0-9._/-]+$/.test(input.remoteRootPath) || input.remoteRootPath.includes('..'))) {
      throw new Error('Remote WordPress root must be a safe absolute path without spaces or parent traversal.')
    }
  }

  private validateDatabaseValue(value: string | null | undefined, pattern: RegExp, label: string): void {
    if (value && (value.length > 255 || !pattern.test(value))) throw new Error(`${label} contains unsupported characters.`)
  }

  private optional(value: string | null | undefined): string | null {
    return value?.trim() || null
  }

  private async entitlementOverview(siteId: string) {
    try {
      return await new EntitlementService(this.repository.getDatabase()).get(siteId)
    } catch {
      return null
    }
  }
}

function monthlyPeriod(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`
}

function addUtcMonths(value: Date, months: number): Date {
  const result = new Date(value)
  result.setUTCMonth(result.getUTCMonth() + months)
  return result
}

function safeClientFolder(value: string): string {
  const folder = value.trim().replace(/[\\/\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').replace(/^\.+$/, '-')
  if (!folder) throw new Error('Client folder name could not be generated.')
  return folder.slice(0, 120)
}

function backupPackagePrefix(domain: string, timestamp: string, backupId: string): string {
  const safeDomain = domain.toLowerCase().replace(/[^a-z0-9.-]/g, '-')
  const compactTimestamp = timestamp.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  return `${safeDomain}_${compactTimestamp}_${backupId}`
}

function safeConnectionFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Hostinger SSH/SFTP connection test failed.'
  return message
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]')
    .slice(0, 500)
}

function normalizedOptionalDate(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('Restore timestamp is invalid.')
  return date.toISOString()
}
