import type {
  CloudflareSecurityEvidence,
  CloudflareSiteConnection,
  UptimeIncident,
  UptimeMaintenanceWindow,
  UptimeMonitorState,
  UptimeObservation
} from '../domain/cloudflare'
import { useDatabase, type QueryExecutor } from '../utils/database'
import { parseJsonRecord } from '../utils/records'

type Row = Record<string, unknown>

export class CloudflareRepository {
  constructor(private readonly database: QueryExecutor = useDatabase()) {}

  getDatabase(): QueryExecutor {
    return this.database
  }

  async findConnection(siteId: string): Promise<CloudflareSiteConnection | null> {
    const result = await this.database.query<Row>('SELECT * FROM cloudflare_site_connections WHERE site_id = $1', [siteId])
    return result.rows[0] ? mapConnection(result.rows[0]) : null
  }

  async findConnectionByHealthCheckId(healthCheckId: string): Promise<CloudflareSiteConnection | null> {
    const result = await this.database.query<Row>(
      'SELECT * FROM cloudflare_site_connections WHERE health_check_id = $1',
      [healthCheckId]
    )
    return result.rows[0] ? mapConnection(result.rows[0]) : null
  }

  async listPortfolioStatus(siteIds: string[]): Promise<Array<{
    siteId: string
    uptimeStatus: string | null
    securityActive: number
    securityReview: number
    tlsAlertOpen: boolean
    universalSslStatus: string | null
  }>> {
    if (!siteIds.length) return []
    const result = await this.database.query<{
      site_id: string, uptime_status: string | null,
      security_active: number, security_review: number, tls_alert_open: boolean,
      universal_ssl_status: string | null
    }>(`
      SELECT
        s.id AS site_id,
        ums.status AS uptime_status,
        COALESCE(security.active_count, 0)::int AS security_active,
        COALESCE(security.review_count, 0)::int AS security_review,
        security.universal_ssl_status,
        EXISTS (
          SELECT 1 FROM uptime_tls_alerts tls
          WHERE tls.site_id = s.id AND tls.status = 'open'
        ) AS tls_alert_open
      FROM sites s
      LEFT JOIN uptime_monitor_state ums ON ums.site_id = s.id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE latest.status = 'active') AS active_count,
          COUNT(*) FILTER (WHERE latest.status <> 'active') AS review_count,
          MAX(latest.status) FILTER (WHERE latest.control_key = 'universal-ssl') AS universal_ssl_status
        FROM (
          SELECT DISTINCT ON (control_key)
            control_key, status
          FROM cloudflare_security_evidence
          WHERE site_id = s.id AND superseded_at IS NULL
          ORDER BY control_key, (source = 'technician') DESC, observed_at DESC
        ) latest
      ) security ON TRUE
      WHERE s.id = ANY($1::text[])
    `, [siteIds])
    return result.rows.map(row => ({
      siteId: row.site_id,
      uptimeStatus: row.uptime_status,
      securityActive: Number(row.security_active),
      securityReview: Number(row.security_review),
      tlsAlertOpen: Boolean(row.tls_alert_open),
      universalSslStatus: row.universal_ssl_status
    }))
  }

  async saveConnection(connection: CloudflareSiteConnection): Promise<CloudflareSiteConnection> {
    const result = await this.database.query<Row>(`
      INSERT INTO cloudflare_site_connections (
        site_id, zone_id, zone_name, account_id, availability, homepage_url,
        health_check_id, health_check_name, health_check_status,
        normal_interval_seconds, alert_failure_threshold, capabilities_json,
        last_synced_at, last_error_code, last_error_message, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb,
        $13, $14, $15, $16, $17
      )
      ON CONFLICT (site_id) DO UPDATE SET
        zone_id = EXCLUDED.zone_id,
        zone_name = EXCLUDED.zone_name,
        account_id = EXCLUDED.account_id,
        availability = EXCLUDED.availability,
        homepage_url = EXCLUDED.homepage_url,
        health_check_id = EXCLUDED.health_check_id,
        health_check_name = EXCLUDED.health_check_name,
        health_check_status = EXCLUDED.health_check_status,
        normal_interval_seconds = EXCLUDED.normal_interval_seconds,
        alert_failure_threshold = EXCLUDED.alert_failure_threshold,
        capabilities_json = EXCLUDED.capabilities_json,
        last_synced_at = EXCLUDED.last_synced_at,
        last_error_code = EXCLUDED.last_error_code,
        last_error_message = EXCLUDED.last_error_message,
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `, [
      connection.siteId, connection.zoneId, connection.zoneName, connection.accountId,
      connection.availability, connection.homepageUrl, connection.healthCheckId,
      connection.healthCheckName, connection.healthCheckStatus,
      connection.normalIntervalSeconds, connection.alertFailureThreshold,
      JSON.stringify(connection.capabilities), connection.lastSyncedAt,
      connection.lastErrorCode, connection.lastErrorMessage,
      connection.createdAt, connection.updatedAt
    ])
    return mapConnection(result.rows[0]!)
  }

  async findMonitor(siteId: string): Promise<UptimeMonitorState | null> {
    const result = await this.database.query<Row>('SELECT * FROM uptime_monitor_state WHERE site_id = $1', [siteId])
    return result.rows[0] ? mapMonitor(result.rows[0]) : null
  }

  async saveMonitor(monitor: UptimeMonitorState): Promise<UptimeMonitorState> {
    const result = await this.database.query<Row>(`
      INSERT INTO uptime_monitor_state (
        site_id, status, consecutive_failures, first_failure_at, first_failure_provider_event_id, last_failure_at,
        last_failure_reason, last_success_at, current_interval_seconds,
        active_incident_id, last_reconciled_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (site_id) DO UPDATE SET
        status = EXCLUDED.status,
        consecutive_failures = EXCLUDED.consecutive_failures,
        first_failure_at = EXCLUDED.first_failure_at,
        first_failure_provider_event_id = EXCLUDED.first_failure_provider_event_id,
        last_failure_at = EXCLUDED.last_failure_at,
        last_failure_reason = EXCLUDED.last_failure_reason,
        last_success_at = EXCLUDED.last_success_at,
        current_interval_seconds = EXCLUDED.current_interval_seconds,
        active_incident_id = EXCLUDED.active_incident_id,
        last_reconciled_at = EXCLUDED.last_reconciled_at,
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `, [
      monitor.siteId, monitor.status, monitor.consecutiveFailures,
      monitor.firstFailureAt, monitor.firstFailureProviderEventId, monitor.lastFailureAt, monitor.lastFailureReason,
      monitor.lastSuccessAt, monitor.currentIntervalSeconds,
      monitor.activeIncidentId, monitor.lastReconciledAt,
      monitor.createdAt, monitor.updatedAt
    ])
    return mapMonitor(result.rows[0]!)
  }

  async findOpenIncident(siteId: string): Promise<UptimeIncident | null> {
    const result = await this.database.query<Row>(
      "SELECT * FROM uptime_incidents WHERE site_id = $1 AND status = 'open' ORDER BY started_at DESC LIMIT 1",
      [siteId]
    )
    return result.rows[0] ? mapIncident(result.rows[0]) : null
  }

  async findIncident(siteId: string, incidentId: string): Promise<UptimeIncident | null> {
    const result = await this.database.query<Row>(
      'SELECT * FROM uptime_incidents WHERE site_id = $1 AND id = $2',
      [siteId, incidentId]
    )
    return result.rows[0] ? mapIncident(result.rows[0]) : null
  }

  async saveIncident(incident: UptimeIncident): Promise<UptimeIncident> {
    const result = await this.database.query<Row>(`
      INSERT INTO uptime_incidents (
        id, site_id, health_check_id, status, started_at, confirmed_at,
        recovered_at, duration_seconds, failure_count, initial_reason,
        final_reason, recovery_notes, restored_backup_reference,
        alert_queued_at, recovery_report_queued_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17
      )
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        recovered_at = EXCLUDED.recovered_at,
        duration_seconds = EXCLUDED.duration_seconds,
        failure_count = EXCLUDED.failure_count,
        final_reason = EXCLUDED.final_reason,
        recovery_notes = EXCLUDED.recovery_notes,
        restored_backup_reference = EXCLUDED.restored_backup_reference,
        alert_queued_at = EXCLUDED.alert_queued_at,
        recovery_report_queued_at = EXCLUDED.recovery_report_queued_at,
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `, [
      incident.id, incident.siteId, incident.healthCheckId, incident.status,
      incident.startedAt, incident.confirmedAt, incident.recoveredAt,
      incident.durationSeconds, incident.failureCount, incident.initialReason,
      incident.finalReason, incident.recoveryNotes, incident.restoredBackupReference,
      incident.alertQueuedAt, incident.recoveryReportQueuedAt,
      incident.createdAt, incident.updatedAt
    ])
    return mapIncident(result.rows[0]!)
  }

  async listIncidents(siteId: string, limit = 100): Promise<UptimeIncident[]> {
    const result = await this.database.query<Row>(`
      SELECT * FROM uptime_incidents WHERE site_id = $1
      ORDER BY started_at DESC LIMIT $2
    `, [siteId, Math.min(500, Math.max(1, limit))])
    return result.rows.map(mapIncident)
  }

  async createObservation(observation: UptimeObservation): Promise<boolean> {
    const result = await this.database.query(`
      INSERT INTO uptime_observations (
        id, site_id, incident_id, provider_event_id, source, status, reason,
        excluded_from_downtime, observed_at, metadata_json, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
      ON CONFLICT (provider_event_id) DO NOTHING
    `, [
      observation.id, observation.siteId, observation.incidentId,
      observation.providerEventId, observation.source, observation.status,
      observation.reason, observation.excludedFromDowntime, observation.observedAt,
      JSON.stringify(observation.metadata), observation.createdAt
    ])
    return (result.rowCount ?? 0) > 0
  }

  async hasObservationProviderEvent(providerEventId: string): Promise<boolean> {
    const result = await this.database.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM uptime_observations WHERE provider_event_id = $1
      ) AS exists
    `, [providerEventId])
    return Boolean(result.rows[0]?.exists)
  }

  async listObservations(siteId: string, limit = 300): Promise<UptimeObservation[]> {
    const result = await this.database.query<Row>(`
      SELECT * FROM uptime_observations WHERE site_id = $1
      ORDER BY observed_at DESC LIMIT $2
    `, [siteId, Math.min(1000, Math.max(1, limit))])
    return result.rows.map(mapObservation)
  }

  async deleteObservationsBefore(before: string): Promise<number> {
    const result = await this.database.query('DELETE FROM uptime_observations WHERE observed_at < $1', [before])
    return result.rowCount ?? 0
  }

  async findActiveMaintenance(siteId: string, at: string): Promise<UptimeMaintenanceWindow | null> {
    const result = await this.database.query<Row>(`
      SELECT * FROM uptime_maintenance_windows
      WHERE site_id = $1 AND cancelled_at IS NULL
        AND starts_at <= $2::timestamptz AND ends_at >= $2::timestamptz
      ORDER BY starts_at DESC LIMIT 1
    `, [siteId, at])
    return result.rows[0] ? mapMaintenance(result.rows[0]) : null
  }

  async listMaintenance(siteId: string): Promise<UptimeMaintenanceWindow[]> {
    const result = await this.database.query<Row>(`
      SELECT * FROM uptime_maintenance_windows WHERE site_id = $1
      ORDER BY starts_at DESC LIMIT 200
    `, [siteId])
    return result.rows.map(mapMaintenance)
  }

  async saveMaintenance(window: UptimeMaintenanceWindow): Promise<UptimeMaintenanceWindow> {
    const result = await this.database.query<Row>(`
      INSERT INTO uptime_maintenance_windows (
        id, site_id, starts_at, ends_at, reason, created_by,
        cancelled_at, cancelled_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      window.id, window.siteId, window.startsAt, window.endsAt,
      window.reason, window.createdBy, window.cancelledAt,
      window.cancelledBy, window.createdAt, window.updatedAt
    ])
    return mapMaintenance(result.rows[0]!)
  }

  async cancelMaintenance(siteId: string, id: string, actor: string, at: string): Promise<boolean> {
    const result = await this.database.query(`
      UPDATE uptime_maintenance_windows
      SET cancelled_at = $3, cancelled_by = $4, updated_at = $3
      WHERE site_id = $1 AND id = $2 AND cancelled_at IS NULL
    `, [siteId, id, at, actor])
    return (result.rowCount ?? 0) > 0
  }

  async findOpenTlsAlert(siteId: string): Promise<Row | null> {
    const result = await this.database.query<Row>(
      "SELECT * FROM uptime_tls_alerts WHERE site_id = $1 AND status = 'open' LIMIT 1",
      [siteId]
    )
    return result.rows[0] ?? null
  }

  async createTlsAlert(input: {
    id: string, siteId: string, openedAt: string, reason: string, alertQueuedAt: string, createdAt: string
  }): Promise<void> {
    await this.database.query(`
      INSERT INTO uptime_tls_alerts (
        id, site_id, status, opened_at, reason, alert_queued_at, created_at, updated_at
      ) VALUES ($1, $2, 'open', $3, $4, $5, $6, $6)
    `, [input.id, input.siteId, input.openedAt, input.reason, input.alertQueuedAt, input.createdAt])
  }

  async resolveTlsAlert(id: string, at: string): Promise<void> {
    await this.database.query(`
      UPDATE uptime_tls_alerts
      SET status = 'resolved', resolved_at = $2, resolution_queued_at = $2, updated_at = $2
      WHERE id = $1 AND status = 'open'
    `, [id, at])
  }

  async createSecuritySync(input: {
    id: string, siteId: string, zoneId: string | null, checkedAt: string,
    capabilities: Record<string, unknown>, warningCount: number
  }): Promise<void> {
    await this.database.query(`
      INSERT INTO cloudflare_security_syncs (
        id, site_id, zone_id, checked_at, capability_summary_json, warning_count, created_at
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $4)
    `, [input.id, input.siteId, input.zoneId, input.checkedAt, JSON.stringify(input.capabilities), input.warningCount])
  }

  async latestSecuritySyncAt(siteId: string): Promise<string | null> {
    const result = await this.database.query<{ checked_at: string }>(`
      SELECT checked_at FROM cloudflare_security_syncs
      WHERE site_id = $1 ORDER BY checked_at DESC LIMIT 1
    `, [siteId])
    return result.rows[0]?.checked_at ?? null
  }

  async addSecurityEvidence(evidence: CloudflareSecurityEvidence): Promise<void> {
    if (evidence.source === 'technician') {
      await this.database.query(`
        UPDATE cloudflare_security_evidence SET superseded_at = $4
        WHERE site_id = $1 AND control_key = $2 AND source = $3 AND superseded_at IS NULL
      `, [evidence.siteId, evidence.controlKey, evidence.source, evidence.observedAt])
    }
    await this.database.query(`
      INSERT INTO cloudflare_security_evidence (
        id, site_id, sync_id, control_key, status, source, summary, notes,
        evidence_json, observed_at, actor_identifier, superseded_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13)
    `, [
      evidence.id, evidence.siteId, evidence.syncId, evidence.controlKey,
      evidence.status, evidence.source, evidence.summary, evidence.notes,
      JSON.stringify(evidence.evidence), evidence.observedAt,
      evidence.actorIdentifier, evidence.supersededAt, evidence.createdAt
    ])
  }

  async listEffectiveSecurityEvidence(siteId: string): Promise<CloudflareSecurityEvidence[]> {
    const result = await this.database.query<Row>(`
      SELECT DISTINCT ON (control_key, source) *
      FROM cloudflare_security_evidence
      WHERE site_id = $1 AND superseded_at IS NULL
      ORDER BY control_key, source, observed_at DESC
    `, [siteId])
    return result.rows.map(mapSecurityEvidence)
  }
}

function text(row: Row, key: string): string {
  return String(row[key])
}
function nullableText(row: Row, key: string): string | null {
  return row[key] == null ? null : String(row[key])
}

function mapConnection(row: Row): CloudflareSiteConnection {
  return {
    siteId: text(row, 'site_id'),
    zoneId: nullableText(row, 'zone_id'),
    zoneName: nullableText(row, 'zone_name'),
    accountId: nullableText(row, 'account_id'),
    availability: text(row, 'availability') as CloudflareSiteConnection['availability'],
    homepageUrl: text(row, 'homepage_url'),
    healthCheckId: nullableText(row, 'health_check_id'),
    healthCheckName: nullableText(row, 'health_check_name'),
    healthCheckStatus: nullableText(row, 'health_check_status'),
    normalIntervalSeconds: Number(row.normal_interval_seconds),
    alertFailureThreshold: Number(row.alert_failure_threshold),
    capabilities: parseJsonRecord(row.capabilities_json),
    lastSyncedAt: nullableText(row, 'last_synced_at'),
    lastErrorCode: nullableText(row, 'last_error_code'),
    lastErrorMessage: nullableText(row, 'last_error_message'),
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at')
  }
}

function mapMonitor(row: Row): UptimeMonitorState {
  return {
    siteId: text(row, 'site_id'),
    status: text(row, 'status') as UptimeMonitorState['status'],
    consecutiveFailures: Number(row.consecutive_failures),
    firstFailureAt: nullableText(row, 'first_failure_at'),
    firstFailureProviderEventId: nullableText(row, 'first_failure_provider_event_id'),
    lastFailureAt: nullableText(row, 'last_failure_at'),
    lastFailureReason: nullableText(row, 'last_failure_reason'),
    lastSuccessAt: nullableText(row, 'last_success_at'),
    currentIntervalSeconds: Number(row.current_interval_seconds),
    activeIncidentId: nullableText(row, 'active_incident_id'),
    lastReconciledAt: nullableText(row, 'last_reconciled_at'),
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at')
  }
}

function mapIncident(row: Row): UptimeIncident {
  return {
    id: text(row, 'id'), siteId: text(row, 'site_id'),
    healthCheckId: nullableText(row, 'health_check_id'),
    status: text(row, 'status') as UptimeIncident['status'],
    startedAt: text(row, 'started_at'), confirmedAt: text(row, 'confirmed_at'),
    recoveredAt: nullableText(row, 'recovered_at'),
    durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
    failureCount: Number(row.failure_count),
    initialReason: nullableText(row, 'initial_reason'), finalReason: nullableText(row, 'final_reason'),
    recoveryNotes: nullableText(row, 'recovery_notes'),
    restoredBackupReference: nullableText(row, 'restored_backup_reference'),
    alertQueuedAt: nullableText(row, 'alert_queued_at'),
    recoveryReportQueuedAt: nullableText(row, 'recovery_report_queued_at'),
    createdAt: text(row, 'created_at'), updatedAt: text(row, 'updated_at')
  }
}

function mapObservation(row: Row): UptimeObservation {
  return {
    id: text(row, 'id'), siteId: text(row, 'site_id'),
    incidentId: nullableText(row, 'incident_id'), providerEventId: nullableText(row, 'provider_event_id'),
    source: text(row, 'source') as UptimeObservation['source'],
    status: text(row, 'status') as UptimeObservation['status'],
    reason: nullableText(row, 'reason'), excludedFromDowntime: Boolean(row.excluded_from_downtime),
    observedAt: text(row, 'observed_at'), metadata: parseJsonRecord(row.metadata_json),
    createdAt: text(row, 'created_at')
  }
}

function mapMaintenance(row: Row): UptimeMaintenanceWindow {
  return {
    id: text(row, 'id'), siteId: text(row, 'site_id'), startsAt: text(row, 'starts_at'),
    endsAt: text(row, 'ends_at'), reason: text(row, 'reason'), createdBy: text(row, 'created_by'),
    cancelledAt: nullableText(row, 'cancelled_at'), cancelledBy: nullableText(row, 'cancelled_by'),
    createdAt: text(row, 'created_at'), updatedAt: text(row, 'updated_at')
  }
}

function mapSecurityEvidence(row: Row): CloudflareSecurityEvidence {
  return {
    id: text(row, 'id'), siteId: text(row, 'site_id'), syncId: nullableText(row, 'sync_id'),
    controlKey: text(row, 'control_key') as CloudflareSecurityEvidence['controlKey'],
    status: text(row, 'status') as CloudflareSecurityEvidence['status'],
    source: text(row, 'source') as CloudflareSecurityEvidence['source'],
    summary: text(row, 'summary'), notes: nullableText(row, 'notes'),
    evidence: parseJsonRecord(row.evidence_json), observedAt: text(row, 'observed_at'),
    actorIdentifier: nullableText(row, 'actor_identifier'),
    supersededAt: nullableText(row, 'superseded_at'), createdAt: text(row, 'created_at')
  }
}
