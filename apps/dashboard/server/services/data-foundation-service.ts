import { useDatabase } from '../utils/database'

export async function getDataFoundationStatus(): Promise<{ appliedMigrations: number, tables: string[] }> {
  const database = useDatabase()
  const [tableResult, migrationResult] = await Promise.all([
    database.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `),
    database.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM schema_migrations')
  ])
  return {
    appliedMigrations: Number(migrationResult.rows[0]?.count ?? 0),
    tables: tableResult.rows.map(row => row.table_name)
  }
}
