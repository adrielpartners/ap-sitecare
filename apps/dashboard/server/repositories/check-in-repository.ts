import type Database from 'better-sqlite3'
import type { HealthStatus, SiteCheckIn, SiteHealthSnapshot } from '../domain/types'
import { useDatabase } from '../utils/database'
import { parseJsonRecord, stringifyRecord } from '../utils/records'

interface CheckInRow {
  id: string
  site_id: string
  received_at: string
  source: string
  request_timestamp: string | null
  payload_json: string
}

interface SnapshotRow {
  id: string
  site_id: string
  check_in_id: string
  status: HealthStatus
  wordpress_version: string | null
  php_version: string | null
  plugin_update_count: number
  theme_update_count: number
  last_cron_run_at: string | null
  created_at: string
}

function mapCheckIn(row: CheckInRow): SiteCheckIn {
  return {
    id: row.id,
    siteId: row.site_id,
    receivedAt: row.received_at,
    source: row.source,
    requestTimestamp: row.request_timestamp,
    payload: parseJsonRecord(row.payload_json)
  }
}

function mapSnapshot(row: SnapshotRow): SiteHealthSnapshot {
  return {
    id: row.id,
    siteId: row.site_id,
    checkInId: row.check_in_id,
    status: row.status,
    wordpressVersion: row.wordpress_version,
    phpVersion: row.php_version,
    pluginUpdateCount: row.plugin_update_count,
    themeUpdateCount: row.theme_update_count,
    lastCronRunAt: row.last_cron_run_at,
    createdAt: row.created_at
  }
}

export class CheckInRepository {
  constructor(private readonly database: Database.Database = useDatabase()) {}

  createCheckIn(checkIn: SiteCheckIn): SiteCheckIn {
    this.database.prepare(`
      INSERT INTO site_check_ins (id, site_id, received_at, source, request_timestamp, payload_json)
      VALUES (@id, @siteId, @receivedAt, @source, @requestTimestamp, @payloadJson)
    `).run({ ...checkIn, payloadJson: stringifyRecord(checkIn.payload) })
    return checkIn
  }

  listForSite(siteId: string): SiteCheckIn[] {
    return (this.database.prepare(`
      SELECT * FROM site_check_ins WHERE site_id = ? ORDER BY received_at DESC
    `).all(siteId) as CheckInRow[]).map(mapCheckIn)
  }

  createSnapshot(snapshot: SiteHealthSnapshot): SiteHealthSnapshot {
    this.database.prepare(`
      INSERT INTO site_health_snapshots (
        id, site_id, check_in_id, status, wordpress_version, php_version,
        plugin_update_count, theme_update_count, last_cron_run_at, created_at
      ) VALUES (
        @id, @siteId, @checkInId, @status, @wordpressVersion, @phpVersion,
        @pluginUpdateCount, @themeUpdateCount, @lastCronRunAt, @createdAt
      )
    `).run(snapshot)
    return snapshot
  }

  findLatestSnapshot(siteId: string): SiteHealthSnapshot | null {
    const row = this.database.prepare(`
      SELECT * FROM site_health_snapshots WHERE site_id = ? ORDER BY created_at DESC LIMIT 1
    `).get(siteId) as SnapshotRow | undefined
    return row ? mapSnapshot(row) : null
  }
}
