import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { BackupArtifact, BackupJob, BackupManifest, BackupPolicy, HostingConnection, RestorePlan } from '../domain/types'
import { useDatabase } from '../utils/database'

const bool = (value: number): boolean => value === 1
const numberBool = (value: boolean): number => value ? 1 : 0

function mapPolicy(row: any): BackupPolicy {
  return {
    siteId: row.site_id,
    enabled: bool(row.enabled),
    frequency: row.frequency,
    filesEnabled: bool(row.files_enabled),
    databaseEnabled: bool(row.database_enabled),
    storageProvider: row.storage_provider,
    retention: {
      keepDaily: row.keep_daily,
      keepWeekly: row.keep_weekly,
      keepMonthly: row.keep_monthly,
      autoDeleteExpired: bool(row.auto_delete_expired)
    },
    restoreEnabled: bool(row.restore_enabled),
    restoreRequiresConfirmation: bool(row.restore_requires_confirmation),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapConnection(row: any): HostingConnection {
  return {
    siteId: row.site_id,
    connectionType: row.connection_type,
    localPath: row.local_path,
    databaseConfigured: bool(row.database_configured),
    databaseHost: row.database_host,
    databasePort: row.database_port,
    databaseName: row.database_name,
    databaseUsername: row.database_username,
    providerLabel: row.provider_label,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapArtifact(row: any): BackupArtifact {
  return {
    id: row.id,
    siteId: row.site_id,
    backupType: row.backup_type,
    frequency: row.frequency,
    filesIncluded: bool(row.files_included),
    databaseIncluded: bool(row.database_included),
    storageProvider: row.storage_provider,
    storagePath: row.storage_path,
    status: row.status,
    sizeBytes: row.size_bytes,
    checksum: row.checksum,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    expiresAt: row.expires_at,
    retentionCategory: row.retention_category,
    manifestPath: row.manifest_path,
    manifest: row.manifest_json ? JSON.parse(row.manifest_json) as BackupManifest : null,
    checksumVerifiedAt: row.checksum_verified_at,
    uploadVerifiedAt: row.upload_verified_at,
    errorMessage: row.error_message
  }
}

function mapJob(row: any): BackupJob {
  return {
    id: row.id,
    siteId: row.site_id,
    backupId: row.backup_id,
    status: row.status,
    runner: row.runner,
    requestedBy: row.requested_by,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    attemptCount: row.attempt_count,
    claimedAt: row.claimed_at,
    heartbeatAt: row.heartbeat_at,
    errorMessage: row.error_message
  }
}

function mapRestorePlan(row: any): RestorePlan {
  return {
    id: row.id,
    siteId: row.site_id,
    backupId: row.backup_id,
    status: row.status,
    restoreFiles: bool(row.restore_files),
    restoreDatabase: bool(row.restore_database),
    capability: row.capability,
    preflight: JSON.parse(row.preflight_json),
    warnings: JSON.parse(row.warnings_json),
    confirmationRequired: bool(row.confirmation_required),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class BackupRepository {
  constructor(private readonly database: Database.Database = useDatabase()) {}

  getDatabase(): Database.Database {
    return this.database
  }

  getPolicy(siteId: string): BackupPolicy | null {
    const row = this.database.prepare('SELECT * FROM backup_policies WHERE site_id = ?').get(siteId)
    return row ? mapPolicy(row) : null
  }

  listPolicies(): BackupPolicy[] {
    return (this.database.prepare('SELECT * FROM backup_policies ORDER BY updated_at DESC').all() as any[]).map(mapPolicy)
  }

  savePolicy(policy: BackupPolicy): BackupPolicy {
    this.database.prepare(`
      INSERT INTO backup_policies (
        site_id, enabled, frequency, files_enabled, database_enabled, storage_provider,
        keep_daily, keep_weekly, keep_monthly, auto_delete_expired, restore_enabled,
        restore_requires_confirmation, notes, created_at, updated_at
      ) VALUES (
        @siteId, @enabled, @frequency, @filesEnabled, @databaseEnabled, @storageProvider,
        @keepDaily, @keepWeekly, @keepMonthly, @autoDeleteExpired, @restoreEnabled,
        @restoreRequiresConfirmation, @notes, @createdAt, @updatedAt
      )
      ON CONFLICT(site_id) DO UPDATE SET
        enabled = excluded.enabled, frequency = excluded.frequency,
        files_enabled = excluded.files_enabled, database_enabled = excluded.database_enabled,
        storage_provider = excluded.storage_provider, keep_daily = excluded.keep_daily,
        keep_weekly = excluded.keep_weekly, keep_monthly = excluded.keep_monthly,
        auto_delete_expired = excluded.auto_delete_expired, restore_enabled = excluded.restore_enabled,
        restore_requires_confirmation = excluded.restore_requires_confirmation,
        notes = excluded.notes, updated_at = excluded.updated_at
    `).run({
      ...policy,
      enabled: numberBool(policy.enabled),
      filesEnabled: numberBool(policy.filesEnabled),
      databaseEnabled: numberBool(policy.databaseEnabled),
      keepDaily: policy.retention.keepDaily,
      keepWeekly: policy.retention.keepWeekly,
      keepMonthly: policy.retention.keepMonthly,
      autoDeleteExpired: numberBool(policy.retention.autoDeleteExpired),
      restoreEnabled: numberBool(policy.restoreEnabled),
      restoreRequiresConfirmation: numberBool(policy.restoreRequiresConfirmation)
    })
    return policy
  }

  getConnection(siteId: string): HostingConnection | null {
    const row = this.database.prepare('SELECT * FROM hosting_connections WHERE site_id = ?').get(siteId)
    return row ? mapConnection(row) : null
  }

  getDatabasePasswordCiphertext(siteId: string): string | null {
    const row = this.database.prepare(`
      SELECT database_password_ciphertext FROM hosting_connections WHERE site_id = ?
    `).get(siteId) as { database_password_ciphertext: string | null } | undefined
    return row?.database_password_ciphertext ?? null
  }

  saveConnection(connection: HostingConnection, databasePasswordCiphertext: string | null): HostingConnection {
    this.database.prepare(`
      INSERT INTO hosting_connections (
        site_id, connection_type, local_path, database_configured, database_host, database_port,
        database_name, database_username, database_password_ciphertext, provider_label, notes, created_at, updated_at
      ) VALUES (
        @siteId, @connectionType, @localPath, @databaseConfigured, @databaseHost, @databasePort,
        @databaseName, @databaseUsername, @databasePasswordCiphertext, @providerLabel, @notes, @createdAt, @updatedAt
      )
      ON CONFLICT(site_id) DO UPDATE SET
        connection_type = excluded.connection_type, local_path = excluded.local_path,
        database_configured = excluded.database_configured, database_host = excluded.database_host,
        database_port = excluded.database_port, database_name = excluded.database_name,
        database_username = excluded.database_username,
        database_password_ciphertext = excluded.database_password_ciphertext,
        provider_label = excluded.provider_label,
        notes = excluded.notes, updated_at = excluded.updated_at
    `).run({ ...connection, databaseConfigured: numberBool(connection.databaseConfigured), databasePasswordCiphertext })
    return connection
  }

  createArtifact(artifact: BackupArtifact): BackupArtifact {
    this.database.prepare(`
      INSERT INTO backup_artifacts (
        id, site_id, backup_type, frequency, files_included, database_included, storage_provider,
        storage_path, status, size_bytes, checksum, started_at, completed_at, expires_at,
        retention_category, manifest_path, error_message
      ) VALUES (
        @id, @siteId, @backupType, @frequency, @filesIncluded, @databaseIncluded, @storageProvider,
        @storagePath, @status, @sizeBytes, @checksum, @startedAt, @completedAt, @expiresAt,
        @retentionCategory, @manifestPath, @errorMessage
      )
    `).run({
      ...artifact,
      filesIncluded: numberBool(artifact.filesIncluded),
      databaseIncluded: numberBool(artifact.databaseIncluded)
    })
    return artifact
  }

  updateArtifact(artifact: BackupArtifact): BackupArtifact {
    this.database.prepare(`
      UPDATE backup_artifacts SET
        files_included = @filesIncluded, database_included = @databaseIncluded,
        storage_path = @storagePath, status = @status, size_bytes = @sizeBytes,
        checksum = @checksum, completed_at = @completedAt, manifest_path = @manifestPath,
        manifest_json = @manifestJson, checksum_verified_at = @checksumVerifiedAt,
        upload_verified_at = @uploadVerifiedAt, error_message = @errorMessage
      WHERE id = @id
    `).run({
      ...artifact,
      filesIncluded: numberBool(artifact.filesIncluded),
      databaseIncluded: numberBool(artifact.databaseIncluded),
      manifestJson: artifact.manifest ? JSON.stringify(artifact.manifest) : null
    })
    return artifact
  }

  getArtifact(id: string): BackupArtifact | null {
    const row = this.database.prepare('SELECT * FROM backup_artifacts WHERE id = ?').get(id)
    return row ? mapArtifact(row) : null
  }

  getJobForBackup(backupId: string): BackupJob | null {
    const row = this.database.prepare('SELECT * FROM backup_jobs WHERE backup_id = ?').get(backupId)
    return row ? mapJob(row) : null
  }

  getJob(id: string): BackupJob | null {
    const row = this.database.prepare('SELECT * FROM backup_jobs WHERE id = ?').get(id)
    return row ? mapJob(row) : null
  }

  listArtifacts(siteId?: string): BackupArtifact[] {
    const rows = siteId
      ? this.database.prepare('SELECT * FROM backup_artifacts WHERE site_id = ? ORDER BY started_at DESC').all(siteId)
      : this.database.prepare('SELECT * FROM backup_artifacts ORDER BY started_at DESC').all()
    return (rows as any[]).map(mapArtifact)
  }

  createJob(job: BackupJob): BackupJob {
    this.database.prepare(`
      INSERT INTO backup_jobs (
        id, site_id, backup_id, status, runner, requested_by, created_at, started_at, completed_at, error_message
      ) VALUES (
        @id, @siteId, @backupId, @status, @runner, @requestedBy, @createdAt, @startedAt, @completedAt, @errorMessage
      )
    `).run(job)
    return job
  }

  saveJobDestinations(jobId: string, destinationIds: string[]): void {
    const insert = this.database.prepare(`
      INSERT INTO backup_job_destinations (job_id, destination_id, priority) VALUES (?, ?, ?)
    `)
    this.database.transaction(() => destinationIds.forEach((destinationId, priority) => insert.run(jobId, destinationId, priority)))()
  }

  getJobDestinationIds(jobId: string): string[] {
    return (this.database.prepare(`
      SELECT destination_id FROM backup_job_destinations WHERE job_id = ? ORDER BY priority ASC
    `).all(jobId) as Array<{ destination_id: string }>).map(row => row.destination_id)
  }

  failStaleJobs(staleBefore: string, now: string): BackupJob[] {
    const stale = this.database.prepare(`
      SELECT * FROM backup_jobs WHERE status = 'running' AND heartbeat_at IS NOT NULL AND heartbeat_at < ?
    `).all(staleBefore) as any[]
    if (!stale.length) return []
    const transaction = this.database.transaction(() => {
      for (const row of stale) {
        this.database.prepare(`
          UPDATE backup_jobs SET status = 'failed', completed_at = ?, error_message = ?, claim_token = NULL
          WHERE id = ? AND status = 'running'
        `).run(now, 'Worker heartbeat expired before completion.', row.id)
        this.database.prepare(`
          UPDATE backup_artifacts SET status = 'failed', completed_at = ?, error_message = ?
          WHERE id = ? AND status = 'running'
        `).run(now, 'Worker heartbeat expired before completion.', row.backup_id)
      }
    })
    transaction()
    return stale.map(row => mapJob({ ...row, status: 'failed', completed_at: now, error_message: 'Worker heartbeat expired before completion.' }))
  }

  claimNextQueuedJob(now: string): (BackupJob & { claimToken: string }) | null {
    const claim = this.database.transaction(() => {
      const claimToken = randomUUID()
      const claimed = this.database.prepare(`
        UPDATE backup_jobs SET
          status = 'running', runner = 'background-worker', started_at = ?,
          claimed_at = ?, heartbeat_at = ?, claim_token = ?, attempt_count = attempt_count + 1,
          error_message = NULL
        WHERE id = (
          SELECT id FROM backup_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1
        ) AND status = 'queued'
        RETURNING *
      `).get(now, now, now, claimToken)
      if (!claimed) return null
      const job = mapJob(claimed)
      this.database.prepare(`
        UPDATE backup_artifacts SET status = 'running', started_at = ?, error_message = NULL
        WHERE id = (SELECT backup_id FROM backup_jobs WHERE id = ?)
      `).run(now, job.id)
      return { ...job, claimToken }
    })
    return claim()
  }

  heartbeatJob(jobId: string, claimToken: string, now: string): void {
    this.database.prepare(`
      UPDATE backup_jobs SET heartbeat_at = ? WHERE id = ? AND status = 'running' AND claim_token = ?
    `).run(now, jobId, claimToken)
  }

  finishJob(jobId: string, claimToken: string, status: 'completed' | 'failed', errorMessage: string | null, now: string): void {
    const result = this.database.prepare(`
      UPDATE backup_jobs SET status = ?, completed_at = ?, heartbeat_at = ?, error_message = ?, claim_token = NULL
      WHERE id = ? AND status = 'running' AND claim_token = ?
    `).run(status, now, now, errorMessage, jobId, claimToken)
    if (result.changes !== 1) throw new Error('Backup job claim is no longer valid.')
  }

  createRestorePlan(plan: RestorePlan): RestorePlan {
    this.database.prepare(`
      INSERT INTO restore_plans (
        id, site_id, backup_id, status, restore_files, restore_database, capability,
        preflight_json, warnings_json, confirmation_required, created_by, created_at, updated_at
      ) VALUES (
        @id, @siteId, @backupId, @status, @restoreFiles, @restoreDatabase, @capability,
        @preflightJson, @warningsJson, @confirmationRequired, @createdBy, @createdAt, @updatedAt
      )
    `).run({
      ...plan,
      restoreFiles: numberBool(plan.restoreFiles),
      restoreDatabase: numberBool(plan.restoreDatabase),
      preflightJson: JSON.stringify(plan.preflight),
      warningsJson: JSON.stringify(plan.warnings),
      confirmationRequired: numberBool(plan.confirmationRequired)
    })
    return plan
  }

  listRestorePlans(siteId?: string): RestorePlan[] {
    const rows = siteId
      ? this.database.prepare('SELECT * FROM restore_plans WHERE site_id = ? ORDER BY created_at DESC').all(siteId)
      : this.database.prepare('SELECT * FROM restore_plans ORDER BY created_at DESC').all()
    return (rows as any[]).map(mapRestorePlan)
  }
}
