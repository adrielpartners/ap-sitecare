import { copyFileSync, existsSync } from 'node:fs'
import Database from 'better-sqlite3'
import type { PostgresDatabase, QueryExecutor } from '../utils/database'
import { runMigrations as runSqliteMigrations } from './sqlite-migrations'

interface TableDefinition {
  name: string
  primaryKey: string[]
  booleanColumns?: string[]
  jsonColumns?: string[]
}

const tables: TableDefinition[] = [
  { name: 'sites', primaryKey: ['id'] },
  { name: 'site_credentials', primaryKey: ['id'] },
  { name: 'site_check_ins', primaryKey: ['id'], jsonColumns: ['payload_json'] },
  { name: 'site_health_snapshots', primaryKey: ['id'] },
  { name: 'audit_events', primaryKey: ['id'], jsonColumns: ['metadata_json'] },
  { name: 'action_requests', primaryKey: ['id'] },
  { name: 'backup_destinations', primaryKey: ['id'], booleanColumns: ['enabled', 'in_master_pool'], jsonColumns: ['configuration_json'] },
  {
    name: 'backup_policies',
    primaryKey: ['site_id'],
    booleanColumns: [
      'enabled',
      'files_enabled',
      'database_enabled',
      'auto_delete_expired',
      'restore_enabled',
      'restore_requires_confirmation'
    ]
  },
  { name: 'hosting_connections', primaryKey: ['site_id'], booleanColumns: ['database_configured'] },
  {
    name: 'backup_artifacts',
    primaryKey: ['id'],
    booleanColumns: ['files_included', 'database_included'],
    jsonColumns: ['manifest_json']
  },
  { name: 'backup_jobs', primaryKey: ['id'] },
  { name: 'site_backup_destination_settings', primaryKey: ['site_id'], booleanColumns: ['allow_multiple'] },
  { name: 'site_backup_destination_assignments', primaryKey: ['site_id', 'destination_id'] },
  { name: 'backup_job_destinations', primaryKey: ['job_id', 'destination_id'] },
  {
    name: 'restore_plans',
    primaryKey: ['id'],
    booleanColumns: ['restore_files', 'restore_database', 'confirmation_required'],
    jsonColumns: ['preflight_json', 'warnings_json']
  }
]

export interface SqliteToPostgresMigrationOptions {
  sourcePath: string
  targetDatabase: PostgresDatabase
  backupPath?: string
  createBackup?: boolean
}

export interface SqliteToPostgresMigrationResult {
  backupPath: string | null
  rowsMigrated: number
  tableCounts: Record<string, number>
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error(`Unsafe database identifier: ${value}`)
  return `"${value}"`
}

function timestampedBackupPath(sourcePath: string): string {
  const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
  return `${sourcePath}.pre-postgresql-${timestamp}.bak`
}

function validateSqlite(database: Database.Database): void {
  const integrity = database.pragma('integrity_check') as Array<{ integrity_check: string }>
  if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') {
    throw new Error(`SQLite integrity check failed: ${JSON.stringify(integrity)}`)
  }

  const foreignKeyFailures = database.pragma('foreign_key_check') as unknown[]
  if (foreignKeyFailures.length > 0) {
    throw new Error(`SQLite foreign key check failed with ${foreignKeyFailures.length} violation(s).`)
  }
}

function sourceRows(database: Database.Database, table: TableDefinition): Array<Record<string, unknown>> {
  return database.prepare(`SELECT * FROM ${quoteIdentifier(table.name)}`).all() as Array<Record<string, unknown>>
}

function normalizedValue(value: unknown, column: string, table: TableDefinition): unknown {
  if (value === null || value === undefined) return null
  if (table.booleanColumns?.includes(column)) return Boolean(value)
  if (table.jsonColumns?.includes(column)) {
    if (typeof value !== 'string') return value
    try {
      return JSON.parse(value)
    } catch {
      throw new Error(`Invalid JSON in ${table.name}.${column}.`)
    }
  }
  return value
}

function keyForRow(row: Record<string, unknown>, table: TableDefinition): string {
  return JSON.stringify(table.primaryKey.map(column => row[column]))
}

async function targetKeys(database: QueryExecutor, table: TableDefinition): Promise<Set<string>> {
  const columns = table.primaryKey.map(quoteIdentifier).join(', ')
  const result = await database.query<Record<string, unknown>>(
    `SELECT ${columns} FROM ${quoteIdentifier(table.name)}`
  )
  return new Set(result.rows.map(row => keyForRow(row, table)))
}

async function assertTargetIsEmptyOrMatching(
  database: QueryExecutor,
  source: Map<string, Array<Record<string, unknown>>>
): Promise<void> {
  for (const table of tables) {
    const sourceKeys = new Set((source.get(table.name) ?? []).map(row => keyForRow(row, table)))
    const existingKeys = await targetKeys(database, table)
    if (existingKeys.size === 0) continue
    if (sourceKeys.size !== existingKeys.size || [...sourceKeys].some(key => !existingKeys.has(key))) {
      throw new Error(
        `PostgreSQL table ${table.name} is not empty and does not exactly match the SQLite primary keys. ` +
        'Use an empty target database or the same target from an earlier run.'
      )
    }
  }
}

async function upsertRows(
  database: QueryExecutor,
  table: TableDefinition,
  rows: Array<Record<string, unknown>>
): Promise<void> {
  for (const row of rows) {
    const columns = Object.keys(row)
    const columnSql = columns.map(quoteIdentifier).join(', ')
    const valuesSql = columns.map((_, index) => `$${index + 1}`).join(', ')
    const updateColumns = columns.filter(column => !table.primaryKey.includes(column))
    const conflictSql = updateColumns.length > 0
      ? `DO UPDATE SET ${updateColumns.map(column => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`).join(', ')}`
      : 'DO NOTHING'

    await database.query(
      `INSERT INTO ${quoteIdentifier(table.name)} (${columnSql}) VALUES (${valuesSql})
       ON CONFLICT (${table.primaryKey.map(quoteIdentifier).join(', ')}) ${conflictSql}`,
      columns.map(column => normalizedValue(row[column], column, table))
    )
  }
}

async function verifyTarget(
  database: QueryExecutor,
  source: Map<string, Array<Record<string, unknown>>>
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const table of tables) {
    const expected = source.get(table.name) ?? []
    const result = await database.query<{ count: number }>(
      `SELECT COUNT(*)::integer AS count FROM ${quoteIdentifier(table.name)}`
    )
    const actual = result.rows[0]?.count ?? 0
    if (actual !== expected.length) {
      throw new Error(`Verification failed for ${table.name}: expected ${expected.length} rows, found ${actual}.`)
    }

    const expectedKeys = new Set(expected.map(row => keyForRow(row, table)))
    const actualKeys = await targetKeys(database, table)
    if (expectedKeys.size !== actualKeys.size || [...expectedKeys].some(key => !actualKeys.has(key))) {
      throw new Error(`Primary-key verification failed for ${table.name}.`)
    }
    counts[table.name] = actual
  }
  return counts
}

async function ensurePhaseThreeOwnershipAndPlanBaseline(database: QueryExecutor): Promise<void> {
  await database.query(`
    INSERT INTO client_accounts (
      id, name, status, created_at, updated_at, is_placeholder
    )
    SELECT
      '00000000-0000-0000-0000-000000000003',
      'Unassigned Sites — Review Required',
      'active',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      TRUE
    WHERE EXISTS (
      SELECT 1
      FROM sites s
      LEFT JOIN site_client_accounts sca ON sca.site_id = s.id
      WHERE sca.site_id IS NULL
    )
    ON CONFLICT (id) DO NOTHING
  `)
  await database.query(`
    INSERT INTO site_client_accounts (site_id, client_account_id, assigned_at, assigned_by)
    SELECT
      s.id,
      '00000000-0000-0000-0000-000000000003',
      CURRENT_TIMESTAMP,
      'system:sqlite-import'
    FROM sites s
    LEFT JOIN site_client_accounts sca ON sca.site_id = s.id
    WHERE sca.site_id IS NULL
    ON CONFLICT (site_id) DO NOTHING
  `)
  await database.query(`
    INSERT INTO site_service_subscriptions (
      site_id, plan_id, status, service_started_at,
      annual_checkup_eligible_at, paid_through_at, cancelled_at,
      created_at, updated_at
    )
    SELECT
      id, 'sitecare-core', 'active', CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM sites
    ON CONFLICT (site_id) DO NOTHING
  `)
  await database.query(`
    INSERT INTO site_plan_transitions (
      id, site_id, transition_type, from_plan_id, to_plan_id, status,
      reason, requested_by, requested_at, effective_at, applied_at,
      cancelled_at, cancelled_by, cancellation_reason
    )
    SELECT
      'sqlite-import:' || id,
      id,
      'initial-assignment',
      NULL,
      'sitecare-core',
      'applied',
      'Initial SiteCare Core assignment after legacy SQLite import.',
      'system:sqlite-import',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      NULL,
      NULL,
      NULL
    FROM sites
    ON CONFLICT (id) DO NOTHING
  `)
}

export async function migrateSqliteToPostgres(
  options: SqliteToPostgresMigrationOptions
): Promise<SqliteToPostgresMigrationResult> {
  if (!existsSync(options.sourcePath)) throw new Error(`SQLite source file does not exist: ${options.sourcePath}`)

  await options.targetDatabase.ready()
  const shouldBackUp = options.createBackup !== false
  const backupPath = shouldBackUp ? (options.backupPath ?? timestampedBackupPath(options.sourcePath)) : null
  if (backupPath) {
    if (existsSync(backupPath)) throw new Error(`Refusing to overwrite existing SQLite backup: ${backupPath}`)
    copyFileSync(options.sourcePath, backupPath)
  }

  const sqlite = new Database(options.sourcePath)
  try {
    sqlite.pragma('foreign_keys = ON')
    validateSqlite(sqlite)
    runSqliteMigrations(sqlite)
    validateSqlite(sqlite)

    const source = new Map(tables.map(table => [table.name, sourceRows(sqlite, table)]))
    await assertTargetIsEmptyOrMatching(options.targetDatabase, source)

    await options.targetDatabase.transaction(async (transaction) => {
      for (const table of tables) {
        await upsertRows(transaction, table, source.get(table.name) ?? [])
      }
      await ensurePhaseThreeOwnershipAndPlanBaseline(transaction)
      await verifyTarget(transaction, source)
    })

    const tableCounts = await verifyTarget(options.targetDatabase, source)
    return {
      backupPath,
      rowsMigrated: Object.values(tableCounts).reduce((total, count) => total + count, 0),
      tableCounts
    }
  } finally {
    sqlite.close()
  }
}
