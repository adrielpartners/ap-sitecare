import type Database from 'better-sqlite3'
import type { BackupDestination, BackupDestinationMode, BackupDestinationProvider } from '../domain/types'
import { useDatabase } from '../utils/database'

const bool = (value: number): boolean => value === 1
const numberBool = (value: boolean): number => value ? 1 : 0

interface DestinationRow {
  id: string
  name: string
  provider: BackupDestinationProvider
  enabled: number
  in_master_pool: number
  credential_source: 'encrypted' | 'runtime'
  configuration_json: string
  credential_ciphertext: string | null
  created_at: string
  updated_at: string
}

function mapDestination(row: DestinationRow): BackupDestination {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    enabled: bool(row.enabled),
    inMasterPool: bool(row.in_master_pool),
    credentialSource: row.credential_source,
    configuration: JSON.parse(row.configuration_json) as Record<string, string>,
    credentialConfigured: Boolean(row.credential_ciphertext) || row.credential_source === 'runtime',
    executable: row.provider === 'dropbox',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class BackupDestinationRepository {
  constructor(private readonly database: Database.Database = useDatabase()) {}

  list(): BackupDestination[] {
    return (this.database.prepare('SELECT * FROM backup_destinations ORDER BY in_master_pool DESC, name ASC').all() as DestinationRow[])
      .map(mapDestination)
  }

  get(id: string): BackupDestination | null {
    const row = this.database.prepare('SELECT * FROM backup_destinations WHERE id = ?').get(id) as DestinationRow | undefined
    return row ? mapDestination(row) : null
  }

  getCredentialCiphertext(id: string): string | null {
    const row = this.database.prepare('SELECT credential_ciphertext FROM backup_destinations WHERE id = ?').get(id) as { credential_ciphertext: string | null } | undefined
    return row?.credential_ciphertext ?? null
  }

  save(destination: BackupDestination, credentialCiphertext: string | null): BackupDestination {
    this.database.prepare(`
      INSERT INTO backup_destinations (
        id, name, provider, enabled, in_master_pool, credential_source, configuration_json,
        credential_ciphertext, created_at, updated_at
      ) VALUES (
        @id, @name, @provider, @enabled, @inMasterPool, @credentialSource, @configurationJson,
        @credentialCiphertext, @createdAt, @updatedAt
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, provider = excluded.provider, enabled = excluded.enabled,
        in_master_pool = excluded.in_master_pool, credential_source = excluded.credential_source,
        configuration_json = excluded.configuration_json,
        credential_ciphertext = excluded.credential_ciphertext, updated_at = excluded.updated_at
    `).run({
      ...destination,
      enabled: numberBool(destination.enabled),
      inMasterPool: numberBool(destination.inMasterPool),
      configurationJson: JSON.stringify(destination.configuration),
      credentialCiphertext
    })
    return destination
  }

  getSiteSettings(siteId: string): { mode: BackupDestinationMode, allowMultiple: boolean, destinationIds: string[] } {
    const row = this.database.prepare('SELECT * FROM site_backup_destination_settings WHERE site_id = ?').get(siteId) as
      { mode: BackupDestinationMode, allow_multiple: number } | undefined
    const assignments = this.database.prepare(`
      SELECT destination_id FROM site_backup_destination_assignments WHERE site_id = ? ORDER BY priority ASC
    `).all(siteId) as Array<{ destination_id: string }>
    return {
      mode: row?.mode ?? 'master',
      allowMultiple: row ? bool(row.allow_multiple) : false,
      destinationIds: assignments.map(item => item.destination_id)
    }
  }

  saveSiteSettings(siteId: string, mode: BackupDestinationMode, allowMultiple: boolean, destinationIds: string[], now: string): void {
    this.database.transaction(() => {
      this.database.prepare(`
        INSERT INTO site_backup_destination_settings (site_id, mode, allow_multiple, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(site_id) DO UPDATE SET
          mode = excluded.mode, allow_multiple = excluded.allow_multiple, updated_at = excluded.updated_at
      `).run(siteId, mode, numberBool(allowMultiple), now)
      this.database.prepare('DELETE FROM site_backup_destination_assignments WHERE site_id = ?').run(siteId)
      const insert = this.database.prepare(`
        INSERT INTO site_backup_destination_assignments (site_id, destination_id, priority) VALUES (?, ?, ?)
      `)
      destinationIds.forEach((destinationId, priority) => insert.run(siteId, destinationId, priority))
    })()
  }
}
