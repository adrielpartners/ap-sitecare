import type { BackupDestination, BackupDestinationMode, BackupDestinationProvider } from '../domain/types'
import { useDatabase, type QueryExecutor, type TransactionalQueryExecutor } from '../utils/database'

interface DestinationRow {
  id: string
  name: string
  provider: BackupDestinationProvider
  enabled: boolean
  in_master_pool: boolean
  credential_source: 'encrypted' | 'runtime'
  configuration_json: unknown
  credential_ciphertext: string | null
  last_tested_at: string | null
  last_connection_status: 'connected' | 'failed' | 'revoked' | null
  last_error_code: string | null
  last_error_message: string | null
  created_at: string
  updated_at: string
}

function configuration(value: unknown): Record<string, string> {
  const parsed = typeof value === 'string' ? JSON.parse(value) as unknown : value
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return {}
  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  )
}

function mapDestination(row: DestinationRow): BackupDestination {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    enabled: row.enabled,
    inMasterPool: row.in_master_pool,
    credentialSource: row.credential_source,
    configuration: configuration(row.configuration_json),
    credentialConfigured: Boolean(row.credential_ciphertext) || row.credential_source === 'runtime',
    executable: row.provider === 'dropbox',
    lastTestedAt: row.last_tested_at,
    lastConnectionStatus: row.last_connection_status,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class BackupDestinationRepository {
  constructor(private readonly database: QueryExecutor | TransactionalQueryExecutor = useDatabase()) {}

  async list(): Promise<BackupDestination[]> {
    const result = await this.database.query<DestinationRow>(
      'SELECT * FROM backup_destinations ORDER BY in_master_pool DESC, name ASC'
    )
    return result.rows.map(mapDestination)
  }

  async get(id: string): Promise<BackupDestination | null> {
    const result = await this.database.query<DestinationRow>(
      'SELECT * FROM backup_destinations WHERE id = $1',
      [id]
    )
    return result.rows[0] ? mapDestination(result.rows[0]) : null
  }

  async getCredentialCiphertext(id: string): Promise<string | null> {
    const result = await this.database.query<{ credential_ciphertext: string | null }>(
      'SELECT credential_ciphertext FROM backup_destinations WHERE id = $1',
      [id]
    )
    return result.rows[0]?.credential_ciphertext ?? null
  }

  async save(destination: BackupDestination, credentialCiphertext: string | null): Promise<BackupDestination> {
    await this.database.query(`
      INSERT INTO backup_destinations (
        id, name, provider, enabled, in_master_pool, credential_source,
        configuration_json, credential_ciphertext, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        provider = excluded.provider,
        enabled = excluded.enabled,
        in_master_pool = excluded.in_master_pool,
        credential_source = excluded.credential_source,
        configuration_json = excluded.configuration_json,
        credential_ciphertext = excluded.credential_ciphertext,
        updated_at = excluded.updated_at
    `, [
      destination.id, destination.name, destination.provider, destination.enabled,
      destination.inMasterPool, destination.credentialSource,
      JSON.stringify(destination.configuration), credentialCiphertext,
      destination.createdAt, destination.updatedAt
    ])
    return destination
  }

  async recordConnectionResult(
    id: string,
    status: 'connected' | 'failed' | 'revoked',
    errorCode: string | null,
    errorMessage: string | null,
    testedAt: string
  ): Promise<void> {
    await this.database.query(`
      UPDATE backup_destinations
      SET last_tested_at = $2,
          last_connection_status = $3,
          last_error_code = $4,
          last_error_message = $5,
          updated_at = $2
      WHERE id = $1
    `, [id, testedAt, status, errorCode, errorMessage])
  }

  async createOAuthState(input: {
    stateHash: string
    destinationId: string
    initiatedBy: string
    expiresAt: string
    createdAt: string
  }): Promise<void> {
    await this.database.query(`
      DELETE FROM backup_destination_oauth_states
      WHERE expires_at <= $1 OR consumed_at IS NOT NULL
    `, [input.createdAt])
    await this.database.query(`
      INSERT INTO backup_destination_oauth_states (
        state_hash, destination_id, initiated_by, expires_at, consumed_at, created_at
      ) VALUES ($1, $2, $3, $4, NULL, $5)
    `, [input.stateHash, input.destinationId, input.initiatedBy, input.expiresAt, input.createdAt])
  }

  async consumeOAuthState(stateHash: string, consumedAt: string): Promise<{
    destinationId: string
    initiatedBy: string
  } | null> {
    const result = await this.database.query<{ destination_id: string, initiated_by: string }>(`
      UPDATE backup_destination_oauth_states
      SET consumed_at = $2
      WHERE state_hash = $1
        AND consumed_at IS NULL
        AND expires_at > $2
      RETURNING destination_id, initiated_by
    `, [stateHash, consumedAt])
    return result.rows[0]
      ? { destinationId: result.rows[0].destination_id, initiatedBy: result.rows[0].initiated_by }
      : null
  }

  async getSiteSettings(siteId: string): Promise<{
    mode: BackupDestinationMode
    allowMultiple: boolean
    destinationIds: string[]
  }> {
    const [settings, assignments] = await Promise.all([
      this.database.query<{ mode: BackupDestinationMode, allow_multiple: boolean }>(
        'SELECT mode, allow_multiple FROM site_backup_destination_settings WHERE site_id = $1',
        [siteId]
      ),
      this.database.query<{ destination_id: string }>(`
        SELECT destination_id
        FROM site_backup_destination_assignments
        WHERE site_id = $1
        ORDER BY priority ASC
      `, [siteId])
    ])
    return {
      mode: settings.rows[0]?.mode ?? 'master',
      allowMultiple: settings.rows[0]?.allow_multiple ?? false,
      destinationIds: assignments.rows.map(item => item.destination_id)
    }
  }

  async saveSiteSettings(
    siteId: string,
    mode: BackupDestinationMode,
    allowMultiple: boolean,
    destinationIds: string[],
    now: string
  ): Promise<void> {
    await this.withTransaction(async (transaction) => {
      await transaction.query(`
        INSERT INTO site_backup_destination_settings (site_id, mode, allow_multiple, updated_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT(site_id) DO UPDATE SET
          mode = excluded.mode,
          allow_multiple = excluded.allow_multiple,
          updated_at = excluded.updated_at
      `, [siteId, mode, allowMultiple, now])
      await transaction.query(
        'DELETE FROM site_backup_destination_assignments WHERE site_id = $1',
        [siteId]
      )
      for (const [priority, destinationId] of destinationIds.entries()) {
        await transaction.query(`
          INSERT INTO site_backup_destination_assignments (
            site_id, destination_id, priority
          ) VALUES ($1, $2, $3)
        `, [siteId, destinationId, priority])
      }
    })
  }

  private async withTransaction<Result>(work: (executor: QueryExecutor) => Promise<Result>): Promise<Result> {
    if ('transaction' in this.database && typeof this.database.transaction === 'function') {
      return this.database.transaction(work)
    }
    return work(this.database)
  }
}
