import type Database from 'better-sqlite3'
import type { RiskLevel, Site, SiteCredential, SiteStatus } from '../domain/types'
import { useDatabase } from '../utils/database'

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
  created_at: string
  revoked_at: string | null
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
    createdAt: row.created_at,
    revokedAt: row.revoked_at
  }
}

export class SiteRepository {
  constructor(private readonly database: Database.Database = useDatabase()) {}

  create(site: Site): Site {
    this.database.prepare(`
      INSERT INTO sites (
        id, name, url, status, hosting_provider, backup_strategy, risk_level, notes,
        created_at, updated_at, disabled_at
      ) VALUES (
        @id, @name, @url, @status, @hostingProvider, @backupStrategy, @riskLevel, @notes,
        @createdAt, @updatedAt, @disabledAt
      )
    `).run(site)
    return site
  }

  findById(id: string): Site | null {
    const row = this.database.prepare('SELECT * FROM sites WHERE id = ?').get(id) as SiteRow | undefined
    return row ? mapSite(row) : null
  }

  list(): Site[] {
    return (this.database.prepare('SELECT * FROM sites ORDER BY name').all() as SiteRow[]).map(mapSite)
  }

  update(site: Site): Site {
    this.database.prepare(`
      UPDATE sites
      SET name = @name, url = @url, status = @status,
          hosting_provider = @hostingProvider, backup_strategy = @backupStrategy,
          risk_level = @riskLevel, notes = @notes,
          updated_at = @updatedAt, disabled_at = @disabledAt
      WHERE id = @id
    `).run(site)
    return site
  }

  createCredential(credential: SiteCredential): SiteCredential {
    this.database.prepare(`
      INSERT INTO site_credentials (id, site_id, secret_ciphertext, secret_hint, created_at, revoked_at)
      VALUES (@id, @siteId, @secretCiphertext, @secretHint, @createdAt, @revokedAt)
    `).run(credential)
    return credential
  }

  findActiveCredential(siteId: string): SiteCredential | null {
    const row = this.database.prepare(`
      SELECT * FROM site_credentials WHERE site_id = ? AND revoked_at IS NULL
    `).get(siteId) as CredentialRow | undefined
    return row ? mapCredential(row) : null
  }

  listCredentials(siteId: string): SiteCredential[] {
    return (this.database.prepare(`
      SELECT * FROM site_credentials WHERE site_id = ? ORDER BY created_at DESC
    `).all(siteId) as CredentialRow[]).map(mapCredential)
  }

  revokeActiveCredential(siteId: string, revokedAt: string): void {
    this.database.prepare(`
      UPDATE site_credentials SET revoked_at = ? WHERE site_id = ? AND revoked_at IS NULL
    `).run(revokedAt, siteId)
  }
}
