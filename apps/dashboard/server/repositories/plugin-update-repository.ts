import type {
  PluginRolloutDetail,
  PluginUpdatePackage,
  PluginUpdateRollout,
  PluginUpdateTarget,
  SiteRecoveryEvidence
} from '../domain/plugin-update'
import { useDatabase, type QueryExecutor, type TransactionalQueryExecutor } from '../utils/database'
import { parseJsonRecord } from '../utils/records'

type PackageRow = Record<string, unknown> & {
  id: string, plugin_slug: string, plugin_name: string, version: string,
  original_filename: string, checksum_sha256: string, size_bytes: string,
  storage_path: string, validation_status: PluginUpdatePackage['validationStatus'],
  scan_status: PluginUpdatePackage['scanStatus'], provenance_json: unknown,
  manifest_json: unknown, uploaded_by: string, created_at: string
}
type RolloutRow = Record<string, unknown> & {
  id: string, package_id: string, action_request_id: string | null,
  status: PluginUpdateRollout['status'], canary_size: number, failure_threshold: number,
  concurrency_limit: number, halt_reason: string | null, created_by: string,
  confirmed_by: string | null, confirmed_at: string | null, started_at: string | null,
  completed_at: string | null, created_at: string, updated_at: string
}
type TargetRow = Record<string, unknown> & {
  id: string, rollout_id: string, site_id: string, plugin_file: string | null,
  installed_version: string | null, target_version: string, resulting_version: string | null,
  category: PluginUpdateTarget['category'], selected: boolean, recovery_ready: boolean,
  recovery_evidence_id: string | null, preflight_status: PluginUpdateTarget['preflightStatus'],
  preflight_message: string | null, batch_number: number | null, status: PluginUpdateTarget['status'],
  automation_job_id: string | null, attempt_count: number, started_at: string | null,
  completed_at: string | null, error_code: string | null, error_message: string | null,
  response_json: unknown, created_at: string, updated_at: string
}
type EvidenceRow = {
  id: string, site_id: string, source: SiteRecoveryEvidence['source'], backup_reference: string,
  backup_completed_at: string, valid_until: string, notes: string | null,
  confirmed_by: string, created_at: string
}

function mapPackage(row: PackageRow): PluginUpdatePackage {
  return {
    id: row.id, pluginSlug: row.plugin_slug, pluginName: row.plugin_name,
    version: row.version, originalFilename: row.original_filename,
    checksumSha256: row.checksum_sha256, sizeBytes: Number(row.size_bytes),
    storagePath: row.storage_path, validationStatus: row.validation_status,
    scanStatus: row.scan_status, provenance: parseJsonRecord(row.provenance_json),
    manifest: parseJsonRecord(row.manifest_json), uploadedBy: row.uploaded_by,
    createdAt: row.created_at
  }
}

function mapRollout(row: RolloutRow): PluginUpdateRollout {
  return {
    id: row.id, packageId: row.package_id, actionRequestId: row.action_request_id,
    status: row.status, canarySize: row.canary_size, failureThreshold: row.failure_threshold,
    concurrencyLimit: row.concurrency_limit, haltReason: row.halt_reason,
    createdBy: row.created_by, confirmedBy: row.confirmed_by,
    confirmedAt: row.confirmed_at, startedAt: row.started_at,
    completedAt: row.completed_at, createdAt: row.created_at, updatedAt: row.updated_at
  }
}

function mapTarget(row: TargetRow): PluginUpdateTarget {
  return {
    id: row.id, rolloutId: row.rollout_id, siteId: row.site_id,
    pluginFile: row.plugin_file, installedVersion: row.installed_version,
    targetVersion: row.target_version, resultingVersion: row.resulting_version,
    category: row.category, selected: row.selected, recoveryReady: row.recovery_ready,
    recoveryEvidenceId: row.recovery_evidence_id, preflightStatus: row.preflight_status,
    preflightMessage: row.preflight_message, batchNumber: row.batch_number,
    status: row.status, automationJobId: row.automation_job_id,
    attemptCount: row.attempt_count, startedAt: row.started_at,
    completedAt: row.completed_at, errorCode: row.error_code,
    errorMessage: row.error_message, response: parseJsonRecord(row.response_json),
    createdAt: row.created_at, updatedAt: row.updated_at
  }
}

function mapEvidence(row: EvidenceRow): SiteRecoveryEvidence {
  return {
    id: row.id, siteId: row.site_id, source: row.source,
    backupReference: row.backup_reference, backupCompletedAt: row.backup_completed_at,
    validUntil: row.valid_until, notes: row.notes, confirmedBy: row.confirmed_by,
    createdAt: row.created_at
  }
}

export class PluginUpdateRepository {
  constructor(private readonly database: QueryExecutor | TransactionalQueryExecutor = useDatabase()) {}

  async savePackage(value: PluginUpdatePackage): Promise<PluginUpdatePackage> {
    const result = await this.database.query<PackageRow>(`
      INSERT INTO plugin_update_packages (
        id, plugin_slug, plugin_name, version, original_filename, checksum_sha256,
        size_bytes, storage_path, validation_status, scan_status, provenance_json,
        manifest_json, uploaded_by, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14)
      ON CONFLICT (checksum_sha256) DO UPDATE SET checksum_sha256 = EXCLUDED.checksum_sha256
      RETURNING *
    `, [
      value.id, value.pluginSlug, value.pluginName, value.version, value.originalFilename,
      value.checksumSha256, value.sizeBytes, value.storagePath, value.validationStatus,
      value.scanStatus, JSON.stringify(value.provenance), JSON.stringify(value.manifest),
      value.uploadedBy, value.createdAt
    ])
    return mapPackage(result.rows[0]!)
  }

  async findPackage(id: string): Promise<PluginUpdatePackage | null> {
    const result = await this.database.query<PackageRow>('SELECT * FROM plugin_update_packages WHERE id = $1', [id])
    return result.rows[0] ? mapPackage(result.rows[0]) : null
  }

  async findPackageByChecksum(checksum: string): Promise<PluginUpdatePackage | null> {
    const result = await this.database.query<PackageRow>('SELECT * FROM plugin_update_packages WHERE checksum_sha256 = $1', [checksum])
    return result.rows[0] ? mapPackage(result.rows[0]) : null
  }

  async listPackages(): Promise<PluginUpdatePackage[]> {
    const result = await this.database.query<PackageRow>('SELECT * FROM plugin_update_packages ORDER BY created_at DESC')
    return result.rows.map(mapPackage)
  }

  async saveEvidence(value: SiteRecoveryEvidence): Promise<SiteRecoveryEvidence> {
    const result = await this.database.query<EvidenceRow>(`
      INSERT INTO site_recovery_evidence (
        id, site_id, source, backup_reference, backup_completed_at, valid_until,
        notes, confirmed_by, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [value.id, value.siteId, value.source, value.backupReference, value.backupCompletedAt,
      value.validUntil, value.notes, value.confirmedBy, value.createdAt])
    return mapEvidence(result.rows[0]!)
  }

  async latestValidEvidence(siteId: string, at: string): Promise<SiteRecoveryEvidence | null> {
    const result = await this.database.query<EvidenceRow>(`
      SELECT * FROM site_recovery_evidence
      WHERE site_id = $1 AND valid_until >= $2
      ORDER BY backup_completed_at DESC LIMIT 1
    `, [siteId, at])
    return result.rows[0] ? mapEvidence(result.rows[0]) : null
  }

  async findEvidence(id: string): Promise<SiteRecoveryEvidence | null> {
    const result = await this.database.query<EvidenceRow>('SELECT * FROM site_recovery_evidence WHERE id=$1', [id])
    return result.rows[0] ? mapEvidence(result.rows[0]) : null
  }

  async createRollout(rollout: PluginUpdateRollout, targets: PluginUpdateTarget[]): Promise<void> {
    const work = async (executor: QueryExecutor) => {
      await executor.query(`
        INSERT INTO plugin_update_rollouts (
          id, package_id, action_request_id, status, canary_size, failure_threshold,
          concurrency_limit, halt_reason, created_by, confirmed_by, confirmed_at,
          started_at, completed_at, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      `, [rollout.id, rollout.packageId, rollout.actionRequestId, rollout.status,
        rollout.canarySize, rollout.failureThreshold, rollout.concurrencyLimit,
        rollout.haltReason, rollout.createdBy, rollout.confirmedBy, rollout.confirmedAt,
        rollout.startedAt, rollout.completedAt, rollout.createdAt, rollout.updatedAt])
      for (const target of targets) await this.insertTarget(target, executor)
    }
    if ('transaction' in this.database && typeof this.database.transaction === 'function') await this.database.transaction(work)
    else await work(this.database)
  }

  private async insertTarget(value: PluginUpdateTarget, executor: QueryExecutor = this.database): Promise<void> {
    await executor.query(`
      INSERT INTO plugin_update_targets (
        id, rollout_id, site_id, plugin_file, installed_version, target_version,
        resulting_version, category, selected, recovery_ready, recovery_evidence_id,
        preflight_status, preflight_message, batch_number, status, automation_job_id,
        attempt_count, started_at, completed_at, error_code, error_message,
        response_json, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23,$24)
    `, [value.id, value.rolloutId, value.siteId, value.pluginFile, value.installedVersion,
      value.targetVersion, value.resultingVersion, value.category, value.selected,
      value.recoveryReady, value.recoveryEvidenceId, value.preflightStatus,
      value.preflightMessage, value.batchNumber, value.status, value.automationJobId,
      value.attemptCount, value.startedAt, value.completedAt, value.errorCode,
      value.errorMessage, JSON.stringify(value.response), value.createdAt, value.updatedAt])
  }

  async findRollout(id: string): Promise<PluginUpdateRollout | null> {
    const result = await this.database.query<RolloutRow>('SELECT * FROM plugin_update_rollouts WHERE id = $1', [id])
    return result.rows[0] ? mapRollout(result.rows[0]) : null
  }

  async listRollouts(): Promise<Array<PluginUpdateRollout & { package: Omit<PluginUpdatePackage, 'storagePath'> }>> {
    const result = await this.database.query<RolloutRow & PackageRow>(`
      SELECT r.*, p.id AS p_id, p.plugin_slug AS p_plugin_slug, p.plugin_name AS p_plugin_name,
        p.version AS p_version, p.original_filename AS p_original_filename,
        p.checksum_sha256 AS p_checksum_sha256, p.size_bytes AS p_size_bytes,
        p.storage_path AS p_storage_path, p.validation_status AS p_validation_status,
        p.scan_status AS p_scan_status, p.provenance_json AS p_provenance_json,
        p.manifest_json AS p_manifest_json, p.uploaded_by AS p_uploaded_by,
        p.created_at AS p_created_at
      FROM plugin_update_rollouts r JOIN plugin_update_packages p ON p.id = r.package_id
      ORDER BY r.created_at DESC
    `)
    return result.rows.map(row => {
      const packageValue = mapPackage({
        ...row, id: String(row.p_id), plugin_slug: String(row.p_plugin_slug),
        plugin_name: String(row.p_plugin_name), version: String(row.p_version),
        original_filename: String(row.p_original_filename), checksum_sha256: String(row.p_checksum_sha256),
        size_bytes: String(row.p_size_bytes), storage_path: String(row.p_storage_path),
        validation_status: row.p_validation_status as PluginUpdatePackage['validationStatus'],
        scan_status: row.p_scan_status as PluginUpdatePackage['scanStatus'],
        provenance_json: row.p_provenance_json, manifest_json: row.p_manifest_json,
        uploaded_by: String(row.p_uploaded_by), created_at: String(row.p_created_at)
      } as PackageRow)
      const { storagePath: _storagePath, ...safePackage } = packageValue
      return { ...mapRollout(row), package: safePackage }
    })
  }

  async detail(id: string): Promise<PluginRolloutDetail | null> {
    const rollout = await this.findRollout(id)
    if (!rollout) return null
    const packageValue = await this.findPackage(rollout.packageId)
    if (!packageValue) return null
    const rows = await this.database.query<TargetRow & { site_name: string, site_url: string }>(`
      SELECT t.*, s.name AS site_name, s.url AS site_url
      FROM plugin_update_targets t JOIN sites s ON s.id = t.site_id
      WHERE t.rollout_id = $1 ORDER BY t.category, s.name
    `, [id])
    const { storagePath: _storagePath, ...safePackage } = packageValue
    return {
      rollout,
      package: safePackage,
      targets: rows.rows.map(row => ({ ...mapTarget(row), siteName: row.site_name, siteUrl: row.site_url }))
    }
  }

  async findTarget(id: string): Promise<PluginUpdateTarget | null> {
    const result = await this.database.query<TargetRow>('SELECT * FROM plugin_update_targets WHERE id = $1', [id])
    return result.rows[0] ? mapTarget(result.rows[0]) : null
  }

  async updateSelection(rolloutId: string, selectedIds: string[], at: string): Promise<void> {
    await this.database.query(`
      UPDATE plugin_update_targets SET selected = (id = ANY($2::text[])), updated_at = $3
      WHERE rollout_id = $1 AND status = 'pending'
    `, [rolloutId, selectedIds, at])
  }

  async approveRollout(id: string, actor: string, at: string): Promise<void> {
    await this.database.query(`
      UPDATE plugin_update_rollouts
      SET status = 'canary-running', confirmed_by = $2, confirmed_at = $3,
        started_at = $3, updated_at = $3
      WHERE id = $1 AND status = 'draft'
    `, [id, actor, at])
  }

  async setActionRequest(id: string, actionRequestId: string, at: string): Promise<void> {
    await this.database.query('UPDATE plugin_update_rollouts SET action_request_id = $2, updated_at = $3 WHERE id = $1', [id, actionRequestId, at])
  }

  async prepareBatches(rolloutId: string, canarySize: number, at: string): Promise<PluginUpdateTarget[]> {
    const result = await this.database.query<TargetRow>(`
      WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY site_id) AS position
        FROM plugin_update_targets WHERE rollout_id = $1 AND selected = TRUE
      )
      UPDATE plugin_update_targets t
      SET batch_number = CASE WHEN ranked.position <= $2 THEN 0 ELSE 1 END,
          preflight_status = CASE WHEN t.category = 'eligible' AND t.recovery_ready THEN 'passed' ELSE 'blocked' END,
          preflight_message = CASE WHEN t.category = 'eligible' AND t.recovery_ready THEN NULL ELSE COALESCE(t.preflight_message, 'Target is not ready.') END,
          updated_at = $3
      FROM ranked WHERE t.id = ranked.id
      RETURNING t.*
    `, [rolloutId, canarySize, at])
    return result.rows.map(mapTarget)
  }

  async setTargetQueued(id: string, jobId: string, at: string): Promise<void> {
    await this.database.query(`UPDATE plugin_update_targets SET status='queued', automation_job_id=$2, updated_at=$3 WHERE id=$1`, [id, jobId, at])
  }

  async setTargetRunning(id: string, at: string): Promise<void> {
    await this.database.query(`UPDATE plugin_update_targets SET status='running', attempt_count=attempt_count+1, started_at=COALESCE(started_at,$2), updated_at=$2 WHERE id=$1`, [id, at])
  }

  async finishTarget(id: string, input: { status: 'succeeded' | 'failed', resultingVersion?: string | null, errorCode?: string | null, errorMessage?: string | null, response?: Record<string, unknown> }, at: string): Promise<void> {
    await this.database.query(`
      UPDATE plugin_update_targets SET status=$2, resulting_version=$3, error_code=$4,
        error_message=$5, response_json=$6::jsonb, completed_at=$7, updated_at=$7 WHERE id=$1
    `, [id, input.status, input.resultingVersion ?? null, input.errorCode ?? null,
      input.errorMessage ?? null, JSON.stringify(input.response ?? {}), at])
  }

  async listTargets(rolloutId: string): Promise<PluginUpdateTarget[]> {
    const result = await this.database.query<TargetRow>('SELECT * FROM plugin_update_targets WHERE rollout_id=$1 ORDER BY batch_number NULLS LAST, site_id', [rolloutId])
    return result.rows.map(mapTarget)
  }

  async setRolloutState(id: string, status: PluginUpdateRollout['status'], haltReason: string | null, at: string): Promise<void> {
    await this.database.query(`
      UPDATE plugin_update_rollouts SET status=$2, halt_reason=$3,
        completed_at=CASE WHEN $2 IN ('completed','failed','cancelled') THEN $4 ELSE completed_at END,
        updated_at=$4 WHERE id=$1
    `, [id, status, haltReason, at])
  }

  async saveDownloadToken(input: { tokenHash: string, packageId: string, targetId: string, expiresAt: string, createdAt: string }): Promise<void> {
    await this.database.query(`INSERT INTO plugin_package_download_tokens (token_hash,package_id,target_id,expires_at,created_at) VALUES ($1,$2,$3,$4,$5)`, [input.tokenHash, input.packageId, input.targetId, input.expiresAt, input.createdAt])
  }

  async claimDownloadToken(tokenHash: string, at: string): Promise<{ packageId: string, targetId: string } | null> {
    const result = await this.database.query<{ package_id: string, target_id: string }>(`
      UPDATE plugin_package_download_tokens SET used_at=$2
      WHERE token_hash=$1 AND used_at IS NULL AND expires_at >= $2
      RETURNING package_id, target_id
    `, [tokenHash, at])
    return result.rows[0] ? { packageId: result.rows[0].package_id, targetId: result.rows[0].target_id } : null
  }
}
