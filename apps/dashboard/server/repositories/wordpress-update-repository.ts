import type {
  Site,
  WordPressUpdateActivity,
  WordPressUpdateInventoryItem,
  WordPressUpdateSnapshot
} from '../domain/types'
import { useDatabase, type QueryExecutor, type TransactionalQueryExecutor } from '../utils/database'
import { parseJsonRecord } from '../utils/records'

interface SnapshotRow {
  id: string
  site_id: string
  check_in_id: string
  contract_version: number
  checked_at: string
  received_at: string
  core_installed_version: string
  core_available_version: string | null
  plugin_count: number
  theme_count: number
  pending_update_count: number
}

interface InventoryRow {
  snapshot_id: string
  site_id: string
  component_type: WordPressUpdateInventoryItem['componentType']
  slug: string
  name: string
  installed_version: string
  available_version: string | null
  active: boolean
  auto_update_enabled: boolean
  support_status: WordPressUpdateInventoryItem['supportStatus']
  premium_license_status: WordPressUpdateInventoryItem['premiumLicenseStatus']
  metadata_json: unknown
}

interface ActivityRow {
  id: string
  site_id: string
  source_event_id: string
  component_type: WordPressUpdateActivity['componentType']
  slug: string
  name: string
  prior_version: string | null
  target_version: string | null
  resulting_version: string | null
  started_at: string | null
  completed_at: string
  outcome: WordPressUpdateActivity['outcome']
  error_code: string | null
  error_message: string | null
  source: WordPressUpdateActivity['source']
  recorded_at: string
}

interface PortfolioRow extends SnapshotRow {
  site_name: string
  site_url: string
  site_status: Site['status']
  latest_success_at: string | null
  latest_failure_at: string | null
  failure_count: number
}

export interface WordPressUpdatePortfolioEntry {
  site: Pick<Site, 'id' | 'name' | 'url' | 'status'>
  snapshot: WordPressUpdateSnapshot
  latestSuccessAt: string | null
  latestFailureAt: string | null
  failureCount: number
}

function mapSnapshot(row: SnapshotRow): WordPressUpdateSnapshot {
  return {
    id: row.id,
    siteId: row.site_id,
    checkInId: row.check_in_id,
    contractVersion: row.contract_version,
    checkedAt: row.checked_at,
    receivedAt: row.received_at,
    coreInstalledVersion: row.core_installed_version,
    coreAvailableVersion: row.core_available_version,
    pluginCount: row.plugin_count,
    themeCount: row.theme_count,
    pendingUpdateCount: row.pending_update_count
  }
}

function mapInventory(row: InventoryRow): WordPressUpdateInventoryItem {
  return {
    snapshotId: row.snapshot_id,
    siteId: row.site_id,
    componentType: row.component_type,
    slug: row.slug,
    name: row.name,
    installedVersion: row.installed_version,
    availableVersion: row.available_version,
    active: row.active,
    autoUpdateEnabled: row.auto_update_enabled,
    supportStatus: row.support_status,
    premiumLicenseStatus: row.premium_license_status,
    metadata: parseJsonRecord(row.metadata_json)
  }
}

function mapActivity(row: ActivityRow): WordPressUpdateActivity {
  return {
    id: row.id,
    siteId: row.site_id,
    sourceEventId: row.source_event_id,
    componentType: row.component_type,
    slug: row.slug,
    name: row.name,
    priorVersion: row.prior_version,
    targetVersion: row.target_version,
    resultingVersion: row.resulting_version,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    outcome: row.outcome,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    source: row.source,
    recordedAt: row.recorded_at
  }
}

export class WordPressUpdateRepository {
  constructor(
    private readonly database: QueryExecutor | TransactionalQueryExecutor = useDatabase()
  ) {}

  async record(
    snapshot: WordPressUpdateSnapshot,
    inventory: WordPressUpdateInventoryItem[],
    activities: WordPressUpdateActivity[]
  ): Promise<string[]> {
    return this.withTransaction(async executor => {
      await executor.query(`
        INSERT INTO wordpress_update_snapshots (
          id, site_id, check_in_id, contract_version, checked_at, received_at,
          core_installed_version, core_available_version, plugin_count,
          theme_count, pending_update_count
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        snapshot.id, snapshot.siteId, snapshot.checkInId, snapshot.contractVersion,
        snapshot.checkedAt, snapshot.receivedAt, snapshot.coreInstalledVersion,
        snapshot.coreAvailableVersion, snapshot.pluginCount, snapshot.themeCount,
        snapshot.pendingUpdateCount
      ])

      for (const item of inventory) {
        await executor.query(`
          INSERT INTO wordpress_update_inventory_items (
            snapshot_id, site_id, component_type, slug, name, installed_version,
            available_version, active, auto_update_enabled, support_status,
            premium_license_status, metadata_json
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
        `, [
          item.snapshotId, item.siteId, item.componentType, item.slug, item.name,
          item.installedVersion, item.availableVersion, item.active,
          item.autoUpdateEnabled, item.supportStatus, item.premiumLicenseStatus,
          JSON.stringify(item.metadata)
        ])
      }

      const accepted: string[] = []
      for (const activity of activities) {
        const inserted = await executor.query<{ source_event_id: string }>(`
          INSERT INTO wordpress_update_activities (
            id, site_id, source_event_id, component_type, slug, name,
            prior_version, target_version, resulting_version, started_at,
            completed_at, outcome, error_code, error_message, source, recorded_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
          )
          ON CONFLICT (site_id, source_event_id) DO NOTHING
          RETURNING source_event_id
        `, [
          activity.id, activity.siteId, activity.sourceEventId,
          activity.componentType, activity.slug, activity.name,
          activity.priorVersion, activity.targetVersion, activity.resultingVersion,
          activity.startedAt, activity.completedAt, activity.outcome,
          activity.errorCode, activity.errorMessage, activity.source,
          activity.recordedAt
        ])
        if (inserted.rows[0]) accepted.push(inserted.rows[0].source_event_id)
        else accepted.push(activity.sourceEventId)
      }
      return accepted
    })
  }

  async findLatestSnapshot(siteId: string): Promise<WordPressUpdateSnapshot | null> {
    const result = await this.database.query<SnapshotRow>(`
      SELECT * FROM wordpress_update_snapshots
      WHERE site_id = $1
      ORDER BY checked_at DESC, received_at DESC
      LIMIT 1
    `, [siteId])
    return result.rows[0] ? mapSnapshot(result.rows[0]) : null
  }

  async listInventory(snapshotId: string): Promise<WordPressUpdateInventoryItem[]> {
    const result = await this.database.query<InventoryRow>(`
      SELECT * FROM wordpress_update_inventory_items
      WHERE snapshot_id = $1
      ORDER BY component_type, name, slug
    `, [snapshotId])
    return result.rows.map(mapInventory)
  }

  async listActivities(siteId: string, limit = 100): Promise<WordPressUpdateActivity[]> {
    const result = await this.database.query<ActivityRow>(`
      SELECT * FROM wordpress_update_activities
      WHERE site_id = $1
      ORDER BY completed_at DESC, recorded_at DESC
      LIMIT $2
    `, [siteId, Math.min(500, Math.max(1, limit))])
    return result.rows.map(mapActivity)
  }

  async listPortfolio(siteIds: string[] | null = null): Promise<WordPressUpdatePortfolioEntry[]> {
    if (siteIds?.length === 0) return []
    const result = await this.database.query<PortfolioRow>(`
      SELECT
        latest.*,
        sites.name AS site_name,
        sites.url AS site_url,
        sites.status AS site_status,
        activity.latest_success_at,
        activity.latest_failure_at,
        COALESCE(activity.failure_count, 0)::integer AS failure_count
      FROM sites
      JOIN LATERAL (
        SELECT * FROM wordpress_update_snapshots
        WHERE wordpress_update_snapshots.site_id = sites.id
        ORDER BY checked_at DESC, received_at DESC
        LIMIT 1
      ) latest ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          MAX(completed_at) FILTER (WHERE outcome IN ('succeeded', 'observed')) AS latest_success_at,
          MAX(completed_at) FILTER (WHERE outcome = 'failed') AS latest_failure_at,
          COUNT(*) FILTER (WHERE outcome = 'failed') AS failure_count
        FROM wordpress_update_activities
        WHERE wordpress_update_activities.site_id = sites.id
      ) activity ON TRUE
      WHERE ($1::text[] IS NULL OR sites.id = ANY($1::text[]))
      ORDER BY latest.pending_update_count DESC, latest.checked_at ASC, sites.name
    `, [siteIds])
    return result.rows.map(row => ({
      site: { id: row.site_id, name: row.site_name, url: row.site_url, status: row.site_status },
      snapshot: mapSnapshot(row),
      latestSuccessAt: row.latest_success_at,
      latestFailureAt: row.latest_failure_at,
      failureCount: row.failure_count
    }))
  }

  private async withTransaction<Result>(work: (executor: QueryExecutor) => Promise<Result>): Promise<Result> {
    if ('transaction' in this.database && typeof this.database.transaction === 'function') {
      return this.database.transaction(work)
    }
    return work(this.database)
  }
}
