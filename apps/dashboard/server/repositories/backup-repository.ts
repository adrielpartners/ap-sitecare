import { randomUUID } from 'node:crypto'
import type {
  BackupArtifact,
  BackupJob,
  BackupManifest,
  BackupPolicy,
  HostingConnection,
  RestorePlan
} from '../domain/types'
import {
  useDatabase,
  type QueryExecutor,
  type TransactionalQueryExecutor
} from '../utils/database'

type DatabaseRow = Record<string, any>

function jsonValue<Value>(value: unknown): Value {
  return (typeof value === 'string' ? JSON.parse(value) : value) as Value
}

function mapPolicy(row: DatabaseRow): BackupPolicy {
  return {
    siteId: row.site_id,
    enabled: row.enabled,
    frequency: row.frequency,
    filesEnabled: row.files_enabled,
    databaseEnabled: row.database_enabled,
    storageProvider: row.storage_provider,
    retention: {
      keepDaily: row.keep_daily,
      keepWeekly: row.keep_weekly,
      keepMonthly: row.keep_monthly,
      autoDeleteExpired: row.auto_delete_expired
    },
    restoreEnabled: row.restore_enabled,
    restoreRequiresConfirmation: row.restore_requires_confirmation,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapConnection(row: DatabaseRow): HostingConnection {
  return {
    siteId: row.site_id,
    connectionType: row.connection_type,
    localPath: row.local_path,
    databaseConfigured: row.database_configured,
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

function mapArtifact(row: DatabaseRow): BackupArtifact {
  return {
    id: row.id,
    siteId: row.site_id,
    backupType: row.backup_type,
    frequency: row.frequency,
    filesIncluded: row.files_included,
    databaseIncluded: row.database_included,
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
    manifest: row.manifest_json ? jsonValue<BackupManifest>(row.manifest_json) : null,
    checksumVerifiedAt: row.checksum_verified_at,
    uploadVerifiedAt: row.upload_verified_at,
    errorMessage: row.error_message
  }
}

function mapJob(row: DatabaseRow): BackupJob {
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

function mapRestorePlan(row: DatabaseRow): RestorePlan {
  return {
    id: row.id,
    siteId: row.site_id,
    backupId: row.backup_id,
    status: row.status,
    restoreFiles: row.restore_files,
    restoreDatabase: row.restore_database,
    capability: row.capability,
    preflight: jsonValue<Record<string, unknown>>(row.preflight_json),
    warnings: jsonValue<string[]>(row.warnings_json),
    confirmationRequired: row.confirmation_required,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class BackupRepository {
  constructor(private readonly database: TransactionalQueryExecutor = useDatabase()) {}

  getDatabase(): TransactionalQueryExecutor {
    return this.database
  }

  async getPolicy(siteId: string): Promise<BackupPolicy | null> {
    const result = await this.database.query<DatabaseRow>(
      'SELECT * FROM backup_policies WHERE site_id = $1',
      [siteId]
    )
    return result.rows[0] ? mapPolicy(result.rows[0]) : null
  }

  async listPolicies(): Promise<BackupPolicy[]> {
    const result = await this.database.query<DatabaseRow>(
      'SELECT * FROM backup_policies ORDER BY updated_at DESC'
    )
    return result.rows.map(mapPolicy)
  }

  async savePolicy(policy: BackupPolicy): Promise<BackupPolicy> {
    await this.database.query(`
      INSERT INTO backup_policies (
        site_id, enabled, frequency, files_enabled, database_enabled, storage_provider,
        keep_daily, keep_weekly, keep_monthly, auto_delete_expired, restore_enabled,
        restore_requires_confirmation, notes, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      )
      ON CONFLICT(site_id) DO UPDATE SET
        enabled = excluded.enabled,
        frequency = excluded.frequency,
        files_enabled = excluded.files_enabled,
        database_enabled = excluded.database_enabled,
        storage_provider = excluded.storage_provider,
        keep_daily = excluded.keep_daily,
        keep_weekly = excluded.keep_weekly,
        keep_monthly = excluded.keep_monthly,
        auto_delete_expired = excluded.auto_delete_expired,
        restore_enabled = excluded.restore_enabled,
        restore_requires_confirmation = excluded.restore_requires_confirmation,
        notes = excluded.notes,
        updated_at = excluded.updated_at
    `, [
      policy.siteId, policy.enabled, policy.frequency, policy.filesEnabled,
      policy.databaseEnabled, policy.storageProvider, policy.retention.keepDaily,
      policy.retention.keepWeekly, policy.retention.keepMonthly,
      policy.retention.autoDeleteExpired, policy.restoreEnabled,
      policy.restoreRequiresConfirmation, policy.notes, policy.createdAt,
      policy.updatedAt
    ])
    return policy
  }

  async getConnection(siteId: string): Promise<HostingConnection | null> {
    const result = await this.database.query<DatabaseRow>(
      'SELECT * FROM hosting_connections WHERE site_id = $1',
      [siteId]
    )
    return result.rows[0] ? mapConnection(result.rows[0]) : null
  }

  async getDatabasePasswordCiphertext(siteId: string): Promise<string | null> {
    const result = await this.database.query<{ database_password_ciphertext: string | null }>(`
      SELECT database_password_ciphertext
      FROM hosting_connections
      WHERE site_id = $1
    `, [siteId])
    return result.rows[0]?.database_password_ciphertext ?? null
  }

  async saveConnection(
    connection: HostingConnection,
    databasePasswordCiphertext: string | null
  ): Promise<HostingConnection> {
    await this.database.query(`
      INSERT INTO hosting_connections (
        site_id, connection_type, local_path, database_configured, database_host,
        database_port, database_name, database_username,
        database_password_ciphertext, provider_label, notes, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
      )
      ON CONFLICT(site_id) DO UPDATE SET
        connection_type = excluded.connection_type,
        local_path = excluded.local_path,
        database_configured = excluded.database_configured,
        database_host = excluded.database_host,
        database_port = excluded.database_port,
        database_name = excluded.database_name,
        database_username = excluded.database_username,
        database_password_ciphertext = excluded.database_password_ciphertext,
        provider_label = excluded.provider_label,
        notes = excluded.notes,
        updated_at = excluded.updated_at
    `, [
      connection.siteId, connection.connectionType, connection.localPath,
      connection.databaseConfigured, connection.databaseHost,
      connection.databasePort, connection.databaseName,
      connection.databaseUsername, databasePasswordCiphertext,
      connection.providerLabel, connection.notes, connection.createdAt,
      connection.updatedAt
    ])
    return connection
  }

  async createArtifact(artifact: BackupArtifact): Promise<BackupArtifact> {
    await this.database.query(`
      INSERT INTO backup_artifacts (
        id, site_id, backup_type, frequency, files_included, database_included,
        storage_provider, storage_path, status, size_bytes, checksum, started_at,
        completed_at, expires_at, retention_category, manifest_path, error_message
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
      )
    `, [
      artifact.id, artifact.siteId, artifact.backupType, artifact.frequency,
      artifact.filesIncluded, artifact.databaseIncluded, artifact.storageProvider,
      artifact.storagePath, artifact.status, artifact.sizeBytes, artifact.checksum,
      artifact.startedAt, artifact.completedAt, artifact.expiresAt,
      artifact.retentionCategory, artifact.manifestPath, artifact.errorMessage
    ])
    return artifact
  }

  async updateArtifact(artifact: BackupArtifact): Promise<BackupArtifact> {
    await this.database.query(`
      UPDATE backup_artifacts SET
        files_included = $2,
        database_included = $3,
        storage_path = $4,
        status = $5,
        size_bytes = $6,
        checksum = $7,
        completed_at = $8,
        manifest_path = $9,
        manifest_json = $10::jsonb,
        checksum_verified_at = $11,
        upload_verified_at = $12,
        error_message = $13
      WHERE id = $1
    `, [
      artifact.id, artifact.filesIncluded, artifact.databaseIncluded,
      artifact.storagePath, artifact.status, artifact.sizeBytes, artifact.checksum,
      artifact.completedAt, artifact.manifestPath,
      artifact.manifest ? JSON.stringify(artifact.manifest) : null,
      artifact.checksumVerifiedAt, artifact.uploadVerifiedAt,
      artifact.errorMessage
    ])
    return artifact
  }

  async getArtifact(id: string): Promise<BackupArtifact | null> {
    const result = await this.database.query<DatabaseRow>(
      'SELECT * FROM backup_artifacts WHERE id = $1',
      [id]
    )
    return result.rows[0] ? mapArtifact(result.rows[0]) : null
  }

  async getJobForBackup(backupId: string): Promise<BackupJob | null> {
    const result = await this.database.query<DatabaseRow>(
      'SELECT * FROM backup_jobs WHERE backup_id = $1',
      [backupId]
    )
    return result.rows[0] ? mapJob(result.rows[0]) : null
  }

  async getJob(id: string): Promise<BackupJob | null> {
    const result = await this.database.query<DatabaseRow>(
      'SELECT * FROM backup_jobs WHERE id = $1',
      [id]
    )
    return result.rows[0] ? mapJob(result.rows[0]) : null
  }

  async listArtifacts(siteId?: string): Promise<BackupArtifact[]> {
    const result = siteId
      ? await this.database.query<DatabaseRow>(
          'SELECT * FROM backup_artifacts WHERE site_id = $1 ORDER BY started_at DESC',
          [siteId]
        )
      : await this.database.query<DatabaseRow>(
          'SELECT * FROM backup_artifacts ORDER BY started_at DESC'
        )
    return result.rows.map(mapArtifact)
  }

  async createJob(job: BackupJob): Promise<BackupJob> {
    await this.database.query(`
      INSERT INTO backup_jobs (
        id, site_id, backup_id, status, runner, requested_by, created_at,
        started_at, completed_at, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      job.id, job.siteId, job.backupId, job.status, job.runner,
      job.requestedBy, job.createdAt, job.startedAt, job.completedAt,
      job.errorMessage
    ])
    return job
  }

  async saveJobDestinations(jobId: string, destinationIds: string[]): Promise<void> {
    await this.database.transaction(async (transaction) => {
      for (const [priority, destinationId] of destinationIds.entries()) {
        await transaction.query(`
          INSERT INTO backup_job_destinations (job_id, destination_id, priority)
          VALUES ($1, $2, $3)
        `, [jobId, destinationId, priority])
      }
    })
  }

  async getJobDestinationIds(jobId: string): Promise<string[]> {
    const result = await this.database.query<{ destination_id: string }>(`
      SELECT destination_id
      FROM backup_job_destinations
      WHERE job_id = $1
      ORDER BY priority ASC
    `, [jobId])
    return result.rows.map(row => row.destination_id)
  }

  async failStaleJobs(staleBefore: string, now: string): Promise<BackupJob[]> {
    return this.database.transaction(async (transaction) => {
      const staleResult = await transaction.query<DatabaseRow>(`
        SELECT *
        FROM backup_jobs
        WHERE status = 'running'
          AND heartbeat_at IS NOT NULL
          AND heartbeat_at < $1
        FOR UPDATE
      `, [staleBefore])
      const stale = staleResult.rows
      if (!stale.length) return []

      const message = 'Worker heartbeat expired before completion.'
      const jobIds = stale.map(row => row.id)
      const backupIds = stale.map(row => row.backup_id)
      await transaction.query(`
        UPDATE backup_jobs
        SET status = 'failed',
            completed_at = $2,
            error_message = $3,
            claim_token = NULL
        WHERE id = ANY($1::text[])
      `, [jobIds, now, message])
      await transaction.query(`
        UPDATE backup_artifacts
        SET status = 'failed',
            completed_at = $2,
            error_message = $3
        WHERE id = ANY($1::text[])
          AND status = 'running'
      `, [backupIds, now, message])

      return stale.map(row => mapJob({
        ...row,
        status: 'failed',
        completed_at: now,
        error_message: message
      }))
    })
  }

  async claimNextQueuedJob(now: string): Promise<(BackupJob & { claimToken: string }) | null> {
    return this.database.transaction(async (transaction) => {
      const queued = await transaction.query<{ id: string }>(`
        SELECT id
        FROM backup_jobs
        WHERE status = 'queued'
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `)
      const id = queued.rows[0]?.id
      if (!id) return null

      const claimToken = randomUUID()
      const claimed = await transaction.query<DatabaseRow>(`
        UPDATE backup_jobs SET
          status = 'running',
          runner = 'background-worker',
          started_at = $2,
          claimed_at = $2,
          heartbeat_at = $2,
          claim_token = $3,
          attempt_count = attempt_count + 1,
          error_message = NULL
        WHERE id = $1
          AND status = 'queued'
        RETURNING *
      `, [id, now, claimToken])
      if (!claimed.rows[0]) return null

      const job = mapJob(claimed.rows[0])
      await transaction.query(`
        UPDATE backup_artifacts
        SET status = 'running', started_at = $2, error_message = NULL
        WHERE id = $1
      `, [job.backupId, now])
      return { ...job, claimToken }
    })
  }

  async heartbeatJob(jobId: string, claimToken: string, now: string): Promise<void> {
    await this.database.query(`
      UPDATE backup_jobs
      SET heartbeat_at = $3
      WHERE id = $1
        AND status = 'running'
        AND claim_token = $2
    `, [jobId, claimToken, now])
  }

  async finishJob(
    jobId: string,
    claimToken: string,
    status: 'completed' | 'failed',
    errorMessage: string | null,
    now: string
  ): Promise<void> {
    const result = await this.database.query(`
      UPDATE backup_jobs
      SET status = $3,
          completed_at = $4,
          heartbeat_at = $4,
          error_message = $5,
          claim_token = NULL
      WHERE id = $1
        AND status = 'running'
        AND claim_token = $2
    `, [jobId, claimToken, status, now, errorMessage])
    if (result.rowCount !== 1) throw new Error('Backup job claim is no longer valid.')
  }

  async createRestorePlan(plan: RestorePlan): Promise<RestorePlan> {
    await this.database.query(`
      INSERT INTO restore_plans (
        id, site_id, backup_id, status, restore_files, restore_database,
        capability, preflight_json, warnings_json, confirmation_required,
        created_by, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12, $13
      )
    `, [
      plan.id, plan.siteId, plan.backupId, plan.status, plan.restoreFiles,
      plan.restoreDatabase, plan.capability, JSON.stringify(plan.preflight),
      JSON.stringify(plan.warnings), plan.confirmationRequired, plan.createdBy,
      plan.createdAt, plan.updatedAt
    ])
    return plan
  }

  async listRestorePlans(siteId?: string): Promise<RestorePlan[]> {
    const result = siteId
      ? await this.database.query<DatabaseRow>(
          'SELECT * FROM restore_plans WHERE site_id = $1 ORDER BY created_at DESC',
          [siteId]
        )
      : await this.database.query<DatabaseRow>(
          'SELECT * FROM restore_plans ORDER BY created_at DESC'
        )
    return result.rows.map(mapRestorePlan)
  }
}

export type BackupTransactionExecutor = QueryExecutor
