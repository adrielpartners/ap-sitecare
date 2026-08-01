import type { HealthStatus, SiteCheckIn, SiteHealthSnapshot } from '../domain/types'
import { useDatabase, type QueryExecutor } from '../utils/database'
import { parseJsonRecord } from '../utils/records'

interface CheckInRow {
  id: string
  site_id: string
  received_at: string
  source: string
  request_timestamp: string | null
  payload_json: unknown
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
  constructor(private readonly database: QueryExecutor = useDatabase()) {}

  async createCheckIn(checkIn: SiteCheckIn): Promise<SiteCheckIn> {
    await this.database.query(`
      INSERT INTO site_check_ins (
        id, site_id, received_at, source, request_timestamp, payload_json
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `, [
      checkIn.id, checkIn.siteId, checkIn.receivedAt, checkIn.source,
      checkIn.requestTimestamp, JSON.stringify(checkIn.payload)
    ])
    return checkIn
  }

  async listForSite(siteId: string): Promise<SiteCheckIn[]> {
    const result = await this.database.query<CheckInRow>(`
      SELECT * FROM site_check_ins WHERE site_id = $1 ORDER BY received_at DESC
    `, [siteId])
    return result.rows.map(mapCheckIn)
  }

  async findLatestCheckIn(siteId: string): Promise<SiteCheckIn | null> {
    const result = await this.database.query<CheckInRow>(`
      SELECT * FROM site_check_ins
      WHERE site_id = $1
      ORDER BY received_at DESC
      LIMIT 1
    `, [siteId])
    return result.rows[0] ? mapCheckIn(result.rows[0]) : null
  }

  async createSnapshot(snapshot: SiteHealthSnapshot): Promise<SiteHealthSnapshot> {
    await this.database.query(`
      INSERT INTO site_health_snapshots (
        id, site_id, check_in_id, status, wordpress_version, php_version,
        plugin_update_count, theme_update_count, last_cron_run_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      snapshot.id, snapshot.siteId, snapshot.checkInId, snapshot.status,
      snapshot.wordpressVersion, snapshot.phpVersion, snapshot.pluginUpdateCount,
      snapshot.themeUpdateCount, snapshot.lastCronRunAt, snapshot.createdAt
    ])
    return snapshot
  }

  async findLatestSnapshot(siteId: string): Promise<SiteHealthSnapshot | null> {
    const result = await this.database.query<SnapshotRow>(`
      SELECT * FROM site_health_snapshots
      WHERE site_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [siteId])
    return result.rows[0] ? mapSnapshot(result.rows[0]) : null
  }
}
