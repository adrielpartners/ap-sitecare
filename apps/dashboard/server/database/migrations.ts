import type Database from 'better-sqlite3'

interface Migration {
  id: number
  name: string
  sql: string
}

const migrations: Migration[] = [
  {
    id: 1,
    name: 'create_core_data_model',
    sql: `
      CREATE TABLE sites (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        disabled_at TEXT
      );

      CREATE TABLE site_credentials (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        secret_ciphertext TEXT NOT NULL,
        secret_hint TEXT NOT NULL,
        created_at TEXT NOT NULL,
        revoked_at TEXT,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX site_credentials_active_site
        ON site_credentials(site_id)
        WHERE revoked_at IS NULL;

      CREATE TABLE site_check_ins (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        received_at TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'wordpress-plugin',
        request_timestamp TEXT,
        payload_json TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      );

      CREATE INDEX site_check_ins_site_received
        ON site_check_ins(site_id, received_at DESC);

      CREATE TABLE site_health_snapshots (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        check_in_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK (status IN ('healthy', 'attention', 'critical', 'unknown')),
        wordpress_version TEXT,
        php_version TEXT,
        plugin_update_count INTEGER NOT NULL DEFAULT 0 CHECK (plugin_update_count >= 0),
        theme_update_count INTEGER NOT NULL DEFAULT 0 CHECK (theme_update_count >= 0),
        last_cron_run_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        FOREIGN KEY (check_in_id) REFERENCES site_check_ins(id) ON DELETE CASCADE
      );

      CREATE INDEX site_health_snapshots_site_created
        ON site_health_snapshots(site_id, created_at DESC);

      CREATE TABLE audit_events (
        id TEXT PRIMARY KEY,
        site_id TEXT,
        actor_type TEXT NOT NULL,
        actor_identifier TEXT,
        event_type TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL
      );

      CREATE INDEX audit_events_site_created
        ON audit_events(site_id, created_at DESC);

      CREATE INDEX audit_events_type_created
        ON audit_events(event_type, created_at DESC);
    `
  }
]

export function runMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `)

  const applied = database
    .prepare('SELECT id FROM schema_migrations')
    .all()
    .map(row => (row as { id: number }).id)

  const applyMigration = database.transaction((migration: Migration) => {
    database.exec(migration.sql)
    database
      .prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)')
      .run(migration.id, migration.name, new Date().toISOString())
  })

  for (const migration of migrations) {
    if (!applied.includes(migration.id)) {
      applyMigration(migration)
    }
  }
}
