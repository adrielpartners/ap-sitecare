import { useDatabase } from '../utils/database'

export function getDataFoundationStatus(): { appliedMigrations: number, tables: string[] } {
  const database = useDatabase()
  const tables = database.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all().map(row => (row as { name: string }).name)
  const migrationRow = database.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get() as { count: number }
  return { appliedMigrations: migrationRow.count, tables }
}
