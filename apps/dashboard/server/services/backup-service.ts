import { randomUUID } from 'node:crypto'
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

interface LongTermBackupEntitlementGate {
  assertCapability(siteId: string, capability: 'long-term-backups'): Promise<unknown>
}

const frequencies: BackupFrequency[] = ['daily', 'weekly', 'monthly']
const providers: StorageProviderType[] = ['dropbox', 's3-compatible', 'google-drive', 'local-filesystem', 'backblaze-b2']
const connectionTypes: HostingConnectionType[] = ['local-vps', 'ssh-sftp', 'sftp-only', 'database-credentials', 'hosting-api', 'manual-unsupported']

export interface BackupRuntimeSettings {
  dropboxAccessToken: string
  dropboxBackupRoot: string
  dropboxAccountLabel: string
  dropboxEnabled: boolean
  dropboxTokenStrategy: 'runtime-access-token' | 'oauth'
  allowedLocalBaseDirectories: string[]
  credentialEncryptionKey: string
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
    const [site, policy, connection, backups, destinations, destinationSettings, restorePlans] = await Promise.all([
      this.siteService.get(siteId),
      this.repository.getPolicy(siteId),
      this.repository.getConnection(siteId),
      this.repository.listArtifacts(siteId),
      this.destinationService.list(),
      this.destinationService.getSiteSettings(siteId),
      this.repository.listRestorePlans(siteId)
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
      latestBackup: backups[0] ?? null,
      nextScheduledBackup: policy?.enabled ? this.nextScheduled(policy.frequency) : null,
      backups,
      restorePlans
    }
  }

  async updatePolicy(siteId: string, input: UpdateBackupPolicyInput, actorIdentifier: string) {
    await this.siteService.get(siteId)
    if (input.enabled) await this.entitlements.assertCapability(siteId, 'long-term-backups')
    this.validateInput(input)
    const [existingPolicy, existingConnection, existingPasswordCiphertext] = await Promise.all([
      this.repository.getPolicy(siteId),
      this.repository.getConnection(siteId),
      this.repository.getDatabasePasswordCiphertext(siteId)
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
    const databaseConfigured = Boolean(databaseHost && databaseName && databaseUsername && databasePasswordCiphertext)
    const connection: HostingConnection = {
      siteId,
      connectionType: input.connectionType,
      localPath: this.optional(input.localPath),
      databaseConfigured,
      databaseHost,
      databasePort: databaseConfigured ? databasePort : null,
      databaseName,
      databaseUsername,
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
      notes: this.optional(input.notes),
      createdAt: existingPolicy?.createdAt ?? now,
      updatedAt: now
    }
    await this.repository.saveConnection(connection, databasePasswordCiphertext)
    await this.repository.savePolicy(policy)
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
      connectionType: 'local-vps',
      localPath: this.optional(input.wordpressPath),
      databaseConfigured,
      databaseHost,
      databasePort: databaseConfigured ? databasePort : null,
      databaseName,
      databaseUsername,
      providerLabel: this.optional(input.providerLabel) ?? existing?.providerLabel ?? 'WordPress plugin',
      notes: `Detected automatically by the WordPress plugin${input.detectedAt ? ` at ${input.detectedAt}` : ''}.`,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    }
    await this.repository.saveConnection(connection, databasePasswordCiphertext)
    return connection
  }

  async planManualBackup(siteId: string, actorIdentifier: string) {
    await this.entitlements.assertCapability(siteId, 'long-term-backups')
    const overview = await this.getSiteOverview(siteId)
    if (!overview.connection) throw new Error('A hosting connection must be configured before preparing a backup.')
    const assessment = overview.connectionAssessment
    const requested = this.manualBackupSelection(overview.policy, assessment)
    if (!requested.filesIncluded && !requested.databaseIncluded) {
      throw new Error('The detected source cannot back up files or the database yet.')
    }
    const destinations = await this.destinationService.resolveForSite(siteId)
    if (!destinations.length) throw new Error('No enabled backup destination is configured for this site.')
    if (destinations.some(destination => !destination.executable || !destination.credentialConfigured)) {
      throw new Error('Every selected backup destination must have an executable adapter and configured credential.')
    }

    const backupId = randomUUID()
    const now = new Date().toISOString()
    const domain = new URL(overview.site.url).hostname
    const primaryDestination = destinations[0]
    if (!primaryDestination) throw new Error('No enabled backup destination is configured for this site.')
    const primaryStorage = await this.destinationService.dropbox(primaryDestination)
    const artifact: BackupArtifact = {
      id: backupId,
      siteId,
      backupType: 'manual',
      frequency: 'manual',
      filesIncluded: requested.filesIncluded,
      databaseIncluded: requested.databaseIncluded,
      storageProvider: primaryDestination.provider,
      storagePath: primaryStorage.artifactPath(domain, backupId),
      status: 'queued',
      sizeBytes: null,
      checksum: null,
      startedAt: now,
      completedAt: null,
      expiresAt: null,
      retentionCategory: 'manual',
      manifestPath: null,
      manifest: null,
      checksumVerifiedAt: null,
      uploadVerifiedAt: null,
      errorMessage: null
    }
    await this.repository.createArtifact(artifact)
    const job = await this.repository.createJob({
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
    })
    await this.repository.saveJobDestinations(job.id, destinations.map(destination => destination.id))
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
        ? 'Backup job queued. A separate background worker will execute it.'
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
    const connection = await this.repository.getConnection(siteId)
    if (!connection) throw new Error('No hosting connection is configured for this site.')
    const assessment = this.assessConnection(connection)
    await this.auditService.record({
      siteId,
      actorType: 'dashboard-user',
      actorIdentifier,
      eventType: 'backup.hosting-connection.tested',
      metadata: { connectionType: connection.connectionType, restoreCapability: assessment.restoreCapability }
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
    return { artifact, job: await this.repository.getJobForBackup(backupId) }
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
    const artifact = await this.repository.createArtifact({
      ...previous,
      id: newBackupId,
      storageProvider: primaryDestination.provider,
      storagePath: storage.artifactPath(new URL(site.url).hostname, newBackupId),
      status: 'queued',
      sizeBytes: null,
      checksum: null,
      startedAt: now,
      completedAt: null,
      manifestPath: null,
      manifest: null,
      checksumVerifiedAt: null,
      uploadVerifiedAt: null,
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
    const [overview, artifact] = await Promise.all([
      this.getSiteOverview(siteId),
      this.repository.getArtifact(backupId)
    ])
    if (!artifact || artifact.siteId !== siteId) throw new Error('Backup not found for this site.')
    const capability = overview.connectionAssessment.restoreCapability
    const checks = {
      restoreEnabled: overview.policy?.restoreEnabled === true,
      backupCompleted: artifact.status === 'completed',
      manifestRecorded: Boolean(artifact.manifestPath),
      checksumRecorded: Boolean(artifact.checksum),
      connectionSupportsRequestedRestore:
        (!artifact.filesIncluded || overview.connectionAssessment.restoreFiles)
        && (!artifact.databaseIncluded || overview.connectionAssessment.restoreDatabase)
    }
    const warnings = [
      'Destructive restore execution is not implemented.',
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

  private assessConnection(connection: HostingConnection): HostingConnectionAssessment {
    return this.adapter(connection.connectionType).assess(connection)
  }

  private adapter(type: HostingConnectionType): HostingConnectionAdapter {
    if (type === 'local-vps') return new LocalVpsConnection(this.settings.allowedLocalBaseDirectories)
    if (type === 'ssh-sftp') return new PlaceholderHostingConnection(type, true, true, 'SSH/SFTP')
    if (type === 'sftp-only') return new PlaceholderHostingConnection(type, true, false, 'SFTP-only')
    if (type === 'database-credentials') return new PlaceholderHostingConnection(type, false, true, 'Database credential')
    if (type === 'hosting-api') return new PlaceholderHostingConnection(type, false, false, 'Hosting API')
    return new PlaceholderHostingConnection(type, false, false, 'Manual/unsupported')
  }

  private dropbox(): DropboxStorageProvider {
    return new DropboxStorageProvider(
      this.settings.dropboxAccessToken,
      this.settings.dropboxBackupRoot,
      this.settings.dropboxAccountLabel,
      this.settings.dropboxEnabled,
      this.settings.dropboxTokenStrategy
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
  }

  private validateDatabaseValue(value: string | null | undefined, pattern: RegExp, label: string): void {
    if (value && (value.length > 255 || !pattern.test(value))) throw new Error(`${label} contains unsupported characters.`)
  }

  private optional(value: string | null | undefined): string | null {
    return value?.trim() || null
  }
}
