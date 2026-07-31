import type { HostingerSiteConnection } from '../domain/types'
import { useDatabase, type QueryExecutor } from '../utils/database'
import { parseJsonRecord } from '../utils/records'

interface HostingerConnectionRow {
  site_id: string
  availability: HostingerSiteConnection['availability']
  domain: string
  account_username: string | null
  website_order_id: string | null
  wordpress_installation_id: string | null
  website_enabled: boolean | null
  wordpress_valid: boolean | null
  root_directory: string | null
  management_url: string | null
  daily_backup_availability: HostingerSiteConnection['dailyBackupAvailability']
  latest_daily_backup_at: string | null
  daily_backup_message: string | null
  metadata_json: unknown
  last_synced_at: string | null
  last_error_code: string | null
  last_error_message: string | null
  created_at: string
  updated_at: string
}

function mapConnection(row: HostingerConnectionRow): HostingerSiteConnection {
  return {
    siteId: row.site_id,
    availability: row.availability,
    domain: row.domain,
    accountUsername: row.account_username,
    websiteOrderId: row.website_order_id,
    wordpressInstallationId: row.wordpress_installation_id,
    websiteEnabled: row.website_enabled,
    wordpressValid: row.wordpress_valid,
    rootDirectory: row.root_directory,
    managementUrl: row.management_url,
    dailyBackupAvailability: row.daily_backup_availability,
    latestDailyBackupAt: row.latest_daily_backup_at,
    dailyBackupMessage: row.daily_backup_message,
    metadata: parseJsonRecord(row.metadata_json),
    lastSyncedAt: row.last_synced_at,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class HostingerRepository {
  constructor(private readonly database: QueryExecutor = useDatabase()) {}

  async save(connection: HostingerSiteConnection): Promise<HostingerSiteConnection> {
    const result = await this.database.query<HostingerConnectionRow>(`
      INSERT INTO hostinger_site_connections (
        site_id, availability, domain, account_username, website_order_id,
        wordpress_installation_id, website_enabled, wordpress_valid,
        root_directory, management_url, daily_backup_availability,
        latest_daily_backup_at, daily_backup_message, metadata_json,
        last_synced_at, last_error_code, last_error_message, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
        $14::jsonb, $15, $16, $17, $18, $19
      )
      ON CONFLICT (site_id) DO UPDATE SET
        availability = EXCLUDED.availability,
        domain = EXCLUDED.domain,
        account_username = EXCLUDED.account_username,
        website_order_id = EXCLUDED.website_order_id,
        wordpress_installation_id = EXCLUDED.wordpress_installation_id,
        website_enabled = EXCLUDED.website_enabled,
        wordpress_valid = EXCLUDED.wordpress_valid,
        root_directory = EXCLUDED.root_directory,
        management_url = EXCLUDED.management_url,
        daily_backup_availability = EXCLUDED.daily_backup_availability,
        latest_daily_backup_at = EXCLUDED.latest_daily_backup_at,
        daily_backup_message = EXCLUDED.daily_backup_message,
        metadata_json = EXCLUDED.metadata_json,
        last_synced_at = EXCLUDED.last_synced_at,
        last_error_code = EXCLUDED.last_error_code,
        last_error_message = EXCLUDED.last_error_message,
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `, [
      connection.siteId, connection.availability, connection.domain,
      connection.accountUsername, connection.websiteOrderId,
      connection.wordpressInstallationId, connection.websiteEnabled,
      connection.wordpressValid, connection.rootDirectory,
      connection.managementUrl, connection.dailyBackupAvailability,
      connection.latestDailyBackupAt, connection.dailyBackupMessage,
      JSON.stringify(connection.metadata), connection.lastSyncedAt,
      connection.lastErrorCode, connection.lastErrorMessage,
      connection.createdAt, connection.updatedAt
    ])
    return mapConnection(result.rows[0]!)
  }

  async findBySiteId(siteId: string): Promise<HostingerSiteConnection | null> {
    const result = await this.database.query<HostingerConnectionRow>(`
      SELECT * FROM hostinger_site_connections WHERE site_id = $1
    `, [siteId])
    return result.rows[0] ? mapConnection(result.rows[0]) : null
  }

  async list(siteIds: string[] | null = null): Promise<HostingerSiteConnection[]> {
    if (siteIds?.length === 0) return []
    const result = await this.database.query<HostingerConnectionRow>(`
      SELECT * FROM hostinger_site_connections
      WHERE ($1::text[] IS NULL OR site_id = ANY($1::text[]))
      ORDER BY domain
    `, [siteIds])
    return result.rows.map(mapConnection)
  }
}
