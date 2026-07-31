import type { RiskLevel, Site, SiteCredential, SitePluginConnection, SiteStatus } from '../domain/types'
import { useDatabase, type QueryExecutor } from '../utils/database'

interface SiteRow {
  id: string
  name: string
  url: string
  status: SiteStatus
  hosting_provider: string | null
  backup_strategy: string | null
  risk_level: RiskLevel
  notes: string | null
  created_at: string
  updated_at: string
  disabled_at: string | null
}

interface CredentialRow {
  id: string
  site_id: string
  secret_ciphertext: string
  secret_hint: string
  state: SiteCredential['state']
  valid_until: string | null
  confirmed_at: string | null
  last_used_at: string | null
  supersedes_credential_id: string | null
  created_at: string
  revoked_at: string | null
}

interface PluginConnectionRow {
  site_id: string
  status: SitePluginConnection['status']
  contract_version: number
  plugin_version: string | null
  wordpress_home_url: string | null
  last_authenticated_at: string | null
  last_check_in_at: string | null
  last_rotation_started_at: string | null
  last_rotation_completed_at: string | null
  rotation_due_at: string | null
  created_at: string
  updated_at: string
}

function mapSite(row: SiteRow): Site {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    status: row.status,
    hostingProvider: row.hosting_provider,
    backupStrategy: row.backup_strategy,
    riskLevel: row.risk_level,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    disabledAt: row.disabled_at
  }
}

function mapCredential(row: CredentialRow): SiteCredential {
  return {
    id: row.id,
    siteId: row.site_id,
    secretCiphertext: row.secret_ciphertext,
    secretHint: row.secret_hint,
    state: row.state,
    validUntil: row.valid_until,
    confirmedAt: row.confirmed_at,
    lastUsedAt: row.last_used_at,
    supersedesCredentialId: row.supersedes_credential_id,
    createdAt: row.created_at,
    revokedAt: row.revoked_at
  }
}

function mapPluginConnection(row: PluginConnectionRow): SitePluginConnection {
  return {
    siteId: row.site_id,
    status: row.status,
    contractVersion: row.contract_version,
    pluginVersion: row.plugin_version,
    wordpressHomeUrl: row.wordpress_home_url,
    lastAuthenticatedAt: row.last_authenticated_at,
    lastCheckInAt: row.last_check_in_at,
    lastRotationStartedAt: row.last_rotation_started_at,
    lastRotationCompletedAt: row.last_rotation_completed_at,
    rotationDueAt: row.rotation_due_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class SiteRepository {
  constructor(private readonly database: QueryExecutor = useDatabase()) {}

  async create(site: Site): Promise<Site> {
    await this.database.query(`
      INSERT INTO sites (
        id, name, url, status, hosting_provider, backup_strategy, risk_level, notes,
        created_at, updated_at, disabled_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      site.id, site.name, site.url, site.status, site.hostingProvider,
      site.backupStrategy, site.riskLevel, site.notes, site.createdAt,
      site.updatedAt, site.disabledAt
    ])
    return site
  }

  async findById(id: string): Promise<Site | null> {
    const result = await this.database.query<SiteRow>('SELECT * FROM sites WHERE id = $1', [id])
    return result.rows[0] ? mapSite(result.rows[0]) : null
  }

  async list(): Promise<Site[]> {
    const result = await this.database.query<SiteRow>('SELECT * FROM sites ORDER BY name')
    return result.rows.map(mapSite)
  }

  async listByIds(siteIds: string[]): Promise<Site[]> {
    if (siteIds.length === 0) return []
    const result = await this.database.query<SiteRow>(`
      SELECT * FROM sites WHERE id = ANY($1::text[]) ORDER BY name
    `, [siteIds])
    return result.rows.map(mapSite)
  }

  async update(site: Site): Promise<Site> {
    await this.database.query(`
      UPDATE sites
      SET name = $2, url = $3, status = $4,
          hosting_provider = $5, backup_strategy = $6,
          risk_level = $7, notes = $8,
          updated_at = $9, disabled_at = $10
      WHERE id = $1
    `, [
      site.id, site.name, site.url, site.status, site.hostingProvider,
      site.backupStrategy, site.riskLevel, site.notes, site.updatedAt,
      site.disabledAt
    ])
    return site
  }

  async createCredential(credential: SiteCredential): Promise<SiteCredential> {
    await this.database.query(`
      INSERT INTO site_credentials (
        id, site_id, secret_ciphertext, secret_hint, state, valid_until,
        confirmed_at, last_used_at, supersedes_credential_id, created_at, revoked_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      credential.id, credential.siteId, credential.secretCiphertext,
      credential.secretHint, credential.state, credential.validUntil,
      credential.confirmedAt, credential.lastUsedAt,
      credential.supersedesCredentialId, credential.createdAt,
      credential.revokedAt
    ])
    return credential
  }

  async replaceCredentialAndConnection(
    credential: SiteCredential,
    connection: SitePluginConnection,
    revokedAt: string
  ): Promise<SiteCredential> {
    return this.withTransaction(async executor => {
      const repository = new SiteRepository(executor)
      await repository.revokeActiveCredential(credential.siteId, revokedAt)
      const created = await repository.createCredential(credential)
      await repository.upsertPluginConnection(connection)
      return created
    })
  }

  async createPendingCredentialAndConnection(
    credential: SiteCredential,
    connection: SitePluginConnection
  ): Promise<SiteCredential> {
    return this.withTransaction(async executor => {
      const repository = new SiteRepository(executor)
      const created = await repository.createCredential(credential)
      await repository.upsertPluginConnection(connection)
      return created
    })
  }

  async revokeCredentialsAndSaveConnection(
    siteId: string,
    connection: SitePluginConnection,
    revokedAt: string
  ): Promise<void> {
    await this.withTransaction(async executor => {
      const repository = new SiteRepository(executor)
      await repository.revokeActiveCredential(siteId, revokedAt)
      await repository.upsertPluginConnection(connection)
    })
  }

  async findActiveCredential(siteId: string): Promise<SiteCredential | null> {
    const result = await this.database.query<CredentialRow>(`
      SELECT * FROM site_credentials WHERE site_id = $1 AND revoked_at IS NULL
        AND state = 'active'
    `, [siteId])
    return result.rows[0] ? mapCredential(result.rows[0]) : null
  }

  async findPendingCredential(siteId: string): Promise<SiteCredential | null> {
    const result = await this.database.query<CredentialRow>(`
      SELECT * FROM site_credentials
      WHERE site_id = $1 AND state = 'pending' AND revoked_at IS NULL
    `, [siteId])
    return result.rows[0] ? mapCredential(result.rows[0]) : null
  }

  async listAcceptedCredentials(siteId: string, at: string): Promise<SiteCredential[]> {
    const result = await this.database.query<CredentialRow>(`
      SELECT * FROM site_credentials
      WHERE site_id = $1
        AND revoked_at IS NULL
        AND (
          state IN ('active', 'pending')
          OR (state = 'overlap' AND valid_until > $2::timestamptz)
        )
      ORDER BY CASE state WHEN 'active' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END
    `, [siteId, at])
    return result.rows.map(mapCredential)
  }

  async listCredentials(siteId: string): Promise<SiteCredential[]> {
    const result = await this.database.query<CredentialRow>(`
      SELECT * FROM site_credentials WHERE site_id = $1 ORDER BY created_at DESC
    `, [siteId])
    return result.rows.map(mapCredential)
  }

  async revokeActiveCredential(siteId: string, revokedAt: string): Promise<void> {
    await this.database.query(`
      UPDATE site_credentials
      SET state = 'revoked', revoked_at = $2
      WHERE site_id = $1 AND revoked_at IS NULL
    `, [siteId, revokedAt])
  }

  async recordCredentialUse(credentialId: string, usedAt: string): Promise<void> {
    await this.database.query(`
      UPDATE site_credentials SET last_used_at = $2 WHERE id = $1
    `, [credentialId, usedAt])
  }

  async confirmPendingCredential(
    siteId: string,
    credentialId: string,
    confirmedAt: string,
    overlapUntil: string,
    nextRotationDueAt: string
  ): Promise<boolean> {
    const work = async (executor: QueryExecutor): Promise<boolean> => {
      const pending = await executor.query<{ id: string }>(`
        SELECT id FROM site_credentials
        WHERE site_id = $1 AND id = $2 AND state = 'pending' AND revoked_at IS NULL
        FOR UPDATE
      `, [siteId, credentialId])
      if (!pending.rows[0]) return false
      await executor.query(`
        UPDATE site_credentials
        SET state = 'overlap', valid_until = $2::timestamptz
        WHERE site_id = $1 AND state = 'active' AND revoked_at IS NULL
      `, [siteId, overlapUntil])
      await executor.query(`
        UPDATE site_credentials
        SET state = 'active', confirmed_at = $3::timestamptz,
            last_used_at = $3::timestamptz, valid_until = NULL
        WHERE site_id = $1 AND id = $2 AND state = 'pending' AND revoked_at IS NULL
      `, [siteId, credentialId, confirmedAt])
      await executor.query(`
        UPDATE site_plugin_connections
        SET last_rotation_completed_at = $2::timestamptz,
            rotation_due_at = $3::timestamptz, updated_at = $2::timestamptz
        WHERE site_id = $1
      `, [siteId, confirmedAt, nextRotationDueAt])
      return true
    }
    if ('transaction' in this.database && typeof this.database.transaction === 'function') {
      return this.database.transaction(work)
    }
    return work(this.database)
  }

  async revokeCredential(siteId: string, credentialId: string, revokedAt: string): Promise<boolean> {
    const result = await this.database.query(`
      UPDATE site_credentials
      SET state = 'revoked', revoked_at = $3::timestamptz
      WHERE site_id = $1 AND id = $2 AND revoked_at IS NULL
    `, [siteId, credentialId, revokedAt])
    return result.rowCount === 1
  }

  async revokeExpiredOverlapCredentials(at: string): Promise<number> {
    const result = await this.database.query(`
      UPDATE site_credentials
      SET state = 'revoked', revoked_at = $1::timestamptz
      WHERE state = 'overlap' AND revoked_at IS NULL AND valid_until <= $1::timestamptz
    `, [at])
    return result.rowCount ?? 0
  }

  async claimPluginRequest(siteId: string, signatureHash: string, acceptedAt: string, expiresAt: string): Promise<boolean> {
    await this.database.query('DELETE FROM plugin_request_signatures WHERE expires_at <= $1::timestamptz', [acceptedAt])
    const result = await this.database.query(`
      INSERT INTO plugin_request_signatures (site_id, signature_hash, accepted_at, expires_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (site_id, signature_hash) DO NOTHING
    `, [siteId, signatureHash, acceptedAt, expiresAt])
    return result.rowCount === 1
  }

  async getPluginConnection(siteId: string): Promise<SitePluginConnection | null> {
    const result = await this.database.query<PluginConnectionRow>(`
      SELECT * FROM site_plugin_connections WHERE site_id = $1
    `, [siteId])
    return result.rows[0] ? mapPluginConnection(result.rows[0]) : null
  }

  async upsertPluginConnection(connection: SitePluginConnection): Promise<SitePluginConnection> {
    const result = await this.database.query<PluginConnectionRow>(`
      INSERT INTO site_plugin_connections (
        site_id, status, contract_version, plugin_version, wordpress_home_url,
        last_authenticated_at, last_check_in_at, last_rotation_started_at,
        last_rotation_completed_at, rotation_due_at, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (site_id) DO UPDATE SET
        status = EXCLUDED.status,
        contract_version = EXCLUDED.contract_version,
        plugin_version = EXCLUDED.plugin_version,
        wordpress_home_url = EXCLUDED.wordpress_home_url,
        last_authenticated_at = EXCLUDED.last_authenticated_at,
        last_check_in_at = EXCLUDED.last_check_in_at,
        last_rotation_started_at = EXCLUDED.last_rotation_started_at,
        last_rotation_completed_at = EXCLUDED.last_rotation_completed_at,
        rotation_due_at = EXCLUDED.rotation_due_at,
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `, [
      connection.siteId, connection.status, connection.contractVersion,
      connection.pluginVersion, connection.wordpressHomeUrl,
      connection.lastAuthenticatedAt, connection.lastCheckInAt,
      connection.lastRotationStartedAt, connection.lastRotationCompletedAt,
      connection.rotationDueAt, connection.createdAt, connection.updatedAt
    ])
    return mapPluginConnection(result.rows[0]!)
  }

  private async withTransaction<Result>(work: (executor: QueryExecutor) => Promise<Result>): Promise<Result> {
    if ('transaction' in this.database && typeof this.database.transaction === 'function') {
      return this.database.transaction(work)
    }
    return work(this.database)
  }
}
