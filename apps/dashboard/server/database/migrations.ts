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
  },
  {
    id: 2,
    name: 'add_operational_site_fields',
    sql: `
      ALTER TABLE sites ADD COLUMN hosting_provider TEXT;
      ALTER TABLE sites ADD COLUMN backup_strategy TEXT;
      ALTER TABLE sites ADD COLUMN risk_level TEXT NOT NULL DEFAULT 'standard'
        CHECK (risk_level IN ('low', 'standard', 'high'));
      ALTER TABLE sites ADD COLUMN notes TEXT;
    `
  },
  {
    id: 3,
    name: 'add_action_requests',
    sql: `
      CREATE TABLE action_requests (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        rationale TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'rejected')),
        requested_by TEXT NOT NULL,
        reviewed_by TEXT,
        review_note TEXT,
        created_at TEXT NOT NULL,
        reviewed_at TEXT,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      );

      CREATE INDEX action_requests_status_created
        ON action_requests(status, created_at DESC);

      CREATE INDEX action_requests_site_created
        ON action_requests(site_id, created_at DESC);
    `
  },
  {
    id: 4,
    name: 'add_remote_backup_foundation',
    sql: `
      CREATE TABLE backup_policies (
        site_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
        frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly', 'monthly')),
        files_enabled INTEGER NOT NULL DEFAULT 1 CHECK (files_enabled IN (0, 1)),
        database_enabled INTEGER NOT NULL DEFAULT 1 CHECK (database_enabled IN (0, 1)),
        storage_provider TEXT NOT NULL DEFAULT 'dropbox',
        keep_daily INTEGER NOT NULL DEFAULT 7 CHECK (keep_daily >= 0),
        keep_weekly INTEGER NOT NULL DEFAULT 4 CHECK (keep_weekly >= 0),
        keep_monthly INTEGER NOT NULL DEFAULT 6 CHECK (keep_monthly >= 0),
        auto_delete_expired INTEGER NOT NULL DEFAULT 0 CHECK (auto_delete_expired IN (0, 1)),
        restore_enabled INTEGER NOT NULL DEFAULT 0 CHECK (restore_enabled IN (0, 1)),
        restore_requires_confirmation INTEGER NOT NULL DEFAULT 1 CHECK (restore_requires_confirmation IN (0, 1)),
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      );

      CREATE TABLE hosting_connections (
        site_id TEXT PRIMARY KEY,
        connection_type TEXT NOT NULL DEFAULT 'manual-unsupported',
        local_path TEXT,
        database_configured INTEGER NOT NULL DEFAULT 0 CHECK (database_configured IN (0, 1)),
        provider_label TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      );

      CREATE TABLE backup_artifacts (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        backup_type TEXT NOT NULL CHECK (backup_type IN ('scheduled', 'manual', 'pre-restore')),
        frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'manual')),
        files_included INTEGER NOT NULL CHECK (files_included IN (0, 1)),
        database_included INTEGER NOT NULL CHECK (database_included IN (0, 1)),
        storage_provider TEXT NOT NULL,
        storage_path TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('planned', 'queued', 'running', 'completed', 'failed', 'expired')),
        size_bytes INTEGER,
        checksum TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        expires_at TEXT,
        retention_category TEXT NOT NULL,
        manifest_path TEXT,
        error_message TEXT,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      );

      CREATE INDEX backup_artifacts_site_started
        ON backup_artifacts(site_id, started_at DESC);

      CREATE TABLE backup_jobs (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        backup_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
        runner TEXT NOT NULL CHECK (runner IN ('manual-placeholder', 'background-worker')),
        requested_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        error_message TEXT,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        FOREIGN KEY (backup_id) REFERENCES backup_artifacts(id) ON DELETE CASCADE
      );

      CREATE TABLE restore_plans (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        backup_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('draft', 'preflight-passed', 'preflight-failed', 'cancelled')),
        restore_files INTEGER NOT NULL CHECK (restore_files IN (0, 1)),
        restore_database INTEGER NOT NULL CHECK (restore_database IN (0, 1)),
        capability TEXT NOT NULL CHECK (capability IN ('full', 'partial', 'backup-only', 'unsupported')),
        preflight_json TEXT NOT NULL DEFAULT '{}',
        warnings_json TEXT NOT NULL DEFAULT '[]',
        confirmation_required INTEGER NOT NULL DEFAULT 1 CHECK (confirmation_required IN (0, 1)),
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        FOREIGN KEY (backup_id) REFERENCES backup_artifacts(id) ON DELETE CASCADE
      );

      CREATE INDEX restore_plans_site_created
        ON restore_plans(site_id, created_at DESC);
    `
  },
  {
    id: 5,
    name: 'add_backup_execution_worker',
    sql: `
      ALTER TABLE hosting_connections ADD COLUMN database_host TEXT;
      ALTER TABLE hosting_connections ADD COLUMN database_port INTEGER;
      ALTER TABLE hosting_connections ADD COLUMN database_name TEXT;
      ALTER TABLE hosting_connections ADD COLUMN database_username TEXT;
      ALTER TABLE hosting_connections ADD COLUMN database_password_ciphertext TEXT;

      ALTER TABLE backup_artifacts ADD COLUMN manifest_json TEXT;
      ALTER TABLE backup_artifacts ADD COLUMN checksum_verified_at TEXT;
      ALTER TABLE backup_artifacts ADD COLUMN upload_verified_at TEXT;

      ALTER TABLE backup_jobs ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE backup_jobs ADD COLUMN claimed_at TEXT;
      ALTER TABLE backup_jobs ADD COLUMN heartbeat_at TEXT;
      ALTER TABLE backup_jobs ADD COLUMN claim_token TEXT;

      CREATE INDEX backup_jobs_status_created
        ON backup_jobs(status, created_at ASC);
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
