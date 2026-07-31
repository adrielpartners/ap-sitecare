import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import Database from 'better-sqlite3'
import { runMigrations as runSqliteMigrations } from '../database/sqlite-migrations'
import { migrateSqliteToPostgres } from '../database/sqlite-to-postgres'
import { createTestDatabase, destroyTestDatabase } from '../testing/postgres-test-database'

describe('SQLite to PostgreSQL migration', () => {
  it('migrates JSON, booleans, relationships, and can be run again safely', async () => {
    const sourcePath = join(mkdtempSync(join(tmpdir(), 'apsc-sqlite-migration-')), 'sitecare.sqlite')
    const sqlite = new Database(sourcePath)
    runSqliteMigrations(sqlite)

    const timestamp = '2026-07-30T12:00:00.000Z'
    sqlite.prepare(`
      INSERT INTO sites (
        id, name, url, status, hosting_provider, backup_strategy, risk_level, notes,
        created_at, updated_at, disabled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'site-1',
      'Migration Fixture',
      'https://migration.example.com',
      'active',
      'Hostinger',
      'Monthly off-site',
      'standard',
      null,
      timestamp,
      timestamp,
      null
    )
    sqlite.prepare(`
      INSERT INTO site_check_ins (
        id, site_id, received_at, source, request_timestamp, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run('check-in-1', 'site-1', timestamp, 'wordpress-plugin', timestamp, JSON.stringify({ pluginUpdateCount: 2 }))
    sqlite.prepare(`
      INSERT INTO site_health_snapshots (
        id, site_id, check_in_id, status, wordpress_version, php_version,
        plugin_update_count, theme_update_count, last_cron_run_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('health-1', 'site-1', 'check-in-1', 'attention', '6.8.2', '8.3', 2, 0, timestamp, timestamp)
    sqlite.prepare(`
      INSERT INTO backup_policies (
        site_id, enabled, frequency, files_enabled, database_enabled, storage_provider,
        keep_daily, keep_weekly, keep_monthly, auto_delete_expired,
        restore_enabled, restore_requires_confirmation, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('site-1', 1, 'monthly', 1, 1, 'dropbox', 0, 0, 24, 1, 1, 1, null, timestamp, timestamp)
    sqlite.close()

    const postgres = await createTestDatabase()
    const first = await migrateSqliteToPostgres({
      sourcePath,
      targetDatabase: postgres,
      createBackup: false
    })
    const second = await migrateSqliteToPostgres({
      sourcePath,
      targetDatabase: postgres,
      createBackup: false
    })

    assert.equal(first.tableCounts.sites, 1)
    assert.equal(second.tableCounts.sites, 1)
    const checkIn = (await postgres.query<{ payload_json: { pluginUpdateCount: number } }>(
      'SELECT payload_json FROM site_check_ins WHERE id = $1',
      ['check-in-1']
    )).rows[0]
    const policy = (await postgres.query<{ enabled: boolean, auto_delete_expired: boolean }>(
      'SELECT enabled, auto_delete_expired FROM backup_policies WHERE site_id = $1',
      ['site-1']
    )).rows[0]
    assert.equal(checkIn?.payload_json.pluginUpdateCount, 2)
    assert.equal(policy?.enabled, true)
    assert.equal(policy?.auto_delete_expired, true)
    await destroyTestDatabase(postgres)
  })
})
