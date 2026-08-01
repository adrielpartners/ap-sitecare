import type { Pool, PoolClient } from 'pg'

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
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        disabled_at TIMESTAMPTZ
      );

      CREATE TABLE site_credentials (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        secret_ciphertext TEXT NOT NULL,
        secret_hint TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX site_credentials_active_site
        ON site_credentials(site_id)
        WHERE revoked_at IS NULL;

      CREATE TABLE site_check_ins (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        received_at TIMESTAMPTZ NOT NULL,
        source TEXT NOT NULL DEFAULT 'wordpress-plugin',
        request_timestamp TIMESTAMPTZ,
        payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
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
        last_cron_run_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
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
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL,
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
        created_at TIMESTAMPTZ NOT NULL,
        reviewed_at TIMESTAMPTZ,
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
        enabled BOOLEAN NOT NULL DEFAULT FALSE,
        frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly', 'monthly')),
        files_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        database_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        storage_provider TEXT NOT NULL DEFAULT 'dropbox',
        keep_daily INTEGER NOT NULL DEFAULT 7 CHECK (keep_daily >= 0),
        keep_weekly INTEGER NOT NULL DEFAULT 4 CHECK (keep_weekly >= 0),
        keep_monthly INTEGER NOT NULL DEFAULT 6 CHECK (keep_monthly >= 0),
        auto_delete_expired BOOLEAN NOT NULL DEFAULT FALSE,
        restore_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        restore_requires_confirmation BOOLEAN NOT NULL DEFAULT TRUE,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      );

      CREATE TABLE hosting_connections (
        site_id TEXT PRIMARY KEY,
        connection_type TEXT NOT NULL DEFAULT 'manual-unsupported',
        local_path TEXT,
        database_configured BOOLEAN NOT NULL DEFAULT FALSE,
        provider_label TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      );

      CREATE TABLE backup_artifacts (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        backup_type TEXT NOT NULL CHECK (backup_type IN ('scheduled', 'manual', 'pre-restore')),
        frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'manual')),
        files_included BOOLEAN NOT NULL,
        database_included BOOLEAN NOT NULL,
        storage_provider TEXT NOT NULL,
        storage_path TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('planned', 'queued', 'running', 'completed', 'failed', 'expired')),
        size_bytes BIGINT,
        checksum TEXT,
        started_at TIMESTAMPTZ NOT NULL,
        completed_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
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
        created_at TIMESTAMPTZ NOT NULL,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        error_message TEXT,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        FOREIGN KEY (backup_id) REFERENCES backup_artifacts(id) ON DELETE CASCADE
      );

      CREATE TABLE restore_plans (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        backup_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('draft', 'preflight-passed', 'preflight-failed', 'cancelled')),
        restore_files BOOLEAN NOT NULL,
        restore_database BOOLEAN NOT NULL,
        capability TEXT NOT NULL CHECK (capability IN ('full', 'partial', 'backup-only', 'unsupported')),
        preflight_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        confirmation_required BOOLEAN NOT NULL DEFAULT TRUE,
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
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

      ALTER TABLE backup_artifacts ADD COLUMN manifest_json JSONB;
      ALTER TABLE backup_artifacts ADD COLUMN checksum_verified_at TIMESTAMPTZ;
      ALTER TABLE backup_artifacts ADD COLUMN upload_verified_at TIMESTAMPTZ;

      ALTER TABLE backup_jobs ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE backup_jobs ADD COLUMN claimed_at TIMESTAMPTZ;
      ALTER TABLE backup_jobs ADD COLUMN heartbeat_at TIMESTAMPTZ;
      ALTER TABLE backup_jobs ADD COLUMN claim_token TEXT;

      CREATE INDEX backup_jobs_status_created
        ON backup_jobs(status, created_at ASC);
    `
  },
  {
    id: 6,
    name: 'add_backup_destination_registry',
    sql: `
      CREATE TABLE backup_destinations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider TEXT NOT NULL CHECK (provider IN ('dropbox', 'google-drive', 's3-compatible')),
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        in_master_pool BOOLEAN NOT NULL DEFAULT FALSE,
        credential_source TEXT NOT NULL DEFAULT 'encrypted' CHECK (credential_source IN ('encrypted', 'runtime')),
        configuration_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        credential_ciphertext TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE site_backup_destination_settings (
        site_id TEXT PRIMARY KEY,
        mode TEXT NOT NULL DEFAULT 'master' CHECK (mode IN ('master', 'override')),
        allow_multiple BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      );

      CREATE TABLE site_backup_destination_assignments (
        site_id TEXT NOT NULL,
        destination_id TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (site_id, destination_id),
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        FOREIGN KEY (destination_id) REFERENCES backup_destinations(id) ON DELETE CASCADE
      );

      CREATE TABLE backup_job_destinations (
        job_id TEXT NOT NULL,
        destination_id TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (job_id, destination_id),
        FOREIGN KEY (job_id) REFERENCES backup_jobs(id) ON DELETE CASCADE,
        FOREIGN KEY (destination_id) REFERENCES backup_destinations(id) ON DELETE RESTRICT
      );

      CREATE INDEX backup_destinations_master_pool
        ON backup_destinations(in_master_pool, enabled, name);

      CREATE INDEX site_backup_destination_priority
        ON site_backup_destination_assignments(site_id, priority);
    `
  },
  {
    id: 7,
    name: 'add_application_identity_and_access',
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        display_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
        mfa_required BOOLEAN NOT NULL DEFAULT FALSE,
        mfa_enrolled_at TIMESTAMPTZ,
        last_login_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        disabled_at TIMESTAMPTZ
      );

      CREATE UNIQUE INDEX users_email_unique ON users (LOWER(email));

      CREATE TABLE user_password_credentials (
        user_id TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        password_changed_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE client_accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE memberships (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'team-member', 'client')),
        client_account_id TEXT,
        all_sites BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (client_account_id) REFERENCES client_accounts(id) ON DELETE CASCADE,
        CHECK (
          (role = 'client' AND client_account_id IS NOT NULL AND all_sites = FALSE)
          OR
          (role IN ('admin', 'team-member') AND client_account_id IS NULL)
        )
      );

      CREATE UNIQUE INDEX memberships_staff_user_unique
        ON memberships(user_id)
        WHERE role IN ('admin', 'team-member');

      CREATE UNIQUE INDEX memberships_client_user_account_unique
        ON memberships(user_id, client_account_id)
        WHERE role = 'client';

      CREATE TABLE site_client_accounts (
        site_id TEXT PRIMARY KEY,
        client_account_id TEXT NOT NULL,
        assigned_at TIMESTAMPTZ NOT NULL,
        assigned_by TEXT NOT NULL,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        FOREIGN KEY (client_account_id) REFERENCES client_accounts(id) ON DELETE CASCADE
      );

      CREATE INDEX site_client_accounts_client
        ON site_client_accounts(client_account_id, site_id);

      CREATE TABLE membership_site_access (
        membership_id TEXT NOT NULL,
        site_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (membership_id, site_id),
        FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE CASCADE,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      );

      CREATE TABLE auth_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        csrf_token_hash TEXT NOT NULL,
        ip_hash TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        last_seen_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        revoked_by TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX auth_sessions_user_active
        ON auth_sessions(user_id, expires_at DESC)
        WHERE revoked_at IS NULL;

      CREATE TABLE invitations (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        display_name TEXT,
        role TEXT NOT NULL CHECK (role IN ('admin', 'team-member', 'client')),
        client_account_id TEXT,
        all_sites BOOLEAN NOT NULL DEFAULT FALSE,
        token_hash TEXT NOT NULL UNIQUE,
        invited_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        accepted_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        FOREIGN KEY (client_account_id) REFERENCES client_accounts(id) ON DELETE CASCADE,
        CHECK (
          (role = 'client' AND client_account_id IS NOT NULL AND all_sites = FALSE)
          OR
          (role IN ('admin', 'team-member') AND client_account_id IS NULL)
        )
      );

      CREATE INDEX invitations_email_created
        ON invitations(LOWER(email), created_at DESC);

      CREATE TABLE invitation_site_access (
        invitation_id TEXT NOT NULL,
        site_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (invitation_id, site_id),
        FOREIGN KEY (invitation_id) REFERENCES invitations(id) ON DELETE CASCADE,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      );

      CREATE TABLE password_resets (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX password_resets_user_created
        ON password_resets(user_id, created_at DESC);

      CREATE TABLE authentication_events (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        email TEXT,
        event_type TEXT NOT NULL,
        ip_hash TEXT,
        user_agent TEXT,
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE INDEX authentication_events_email_created
        ON authentication_events(LOWER(email), created_at DESC);

      CREATE INDEX authentication_events_ip_created
        ON authentication_events(ip_hash, created_at DESC);

      CREATE TABLE user_mfa_factors (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        factor_type TEXT NOT NULL CHECK (factor_type IN ('totp')),
        secret_ciphertext TEXT NOT NULL,
        recovery_codes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL,
        verified_at TIMESTAMPTZ,
        disabled_at TIMESTAMPTZ,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX user_mfa_factors_active
        ON user_mfa_factors(user_id, factor_type)
        WHERE disabled_at IS NULL;

      CREATE TABLE email_outbox (
        id TEXT PRIMARY KEY,
        message_type TEXT NOT NULL,
        recipient_email TEXT NOT NULL,
        subject TEXT NOT NULL,
        text_content TEXT NOT NULL,
        html_content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
        idempotency_key TEXT NOT NULL UNIQUE,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        available_at TIMESTAMPTZ NOT NULL,
        claimed_at TIMESTAMPTZ,
        sent_at TIMESTAMPTZ,
        provider_message_id TEXT,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX email_outbox_pending
        ON email_outbox(status, available_at ASC);
    `
  },
  {
    id: 8,
    name: 'add_clients_plans_entitlements_and_overrides',
    sql: `
      ALTER TABLE client_accounts
        ADD COLUMN is_placeholder BOOLEAN NOT NULL DEFAULT FALSE;

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
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO site_client_accounts (
        site_id, client_account_id, assigned_at, assigned_by
      )
      SELECT
        s.id,
        '00000000-0000-0000-0000-000000000003',
        CURRENT_TIMESTAMP,
        'system:migration-8'
      FROM sites s
      LEFT JOIN site_client_accounts sca ON sca.site_id = s.id
      WHERE sca.site_id IS NULL;

      CREATE TABLE site_service_subscriptions (
        site_id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL
          CHECK (plan_id IN ('sitecare-core', 'sitecare-plus', 'sitecare-pro')),
        status TEXT NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'cancelled')),
        service_started_at TIMESTAMPTZ NOT NULL,
        annual_checkup_eligible_at TIMESTAMPTZ NOT NULL,
        paid_through_at TIMESTAMPTZ,
        cancelled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        CHECK (
          (status = 'active' AND cancelled_at IS NULL)
          OR
          (status = 'cancelled' AND cancelled_at IS NOT NULL)
        )
      );

      CREATE TABLE site_plan_transitions (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        transition_type TEXT NOT NULL
          CHECK (transition_type IN (
            'initial-assignment', 'upgrade', 'downgrade', 'cancellation',
            'suspension', 'reactivation'
          )),
        from_plan_id TEXT
          CHECK (from_plan_id IS NULL OR from_plan_id IN ('sitecare-core', 'sitecare-plus', 'sitecare-pro')),
        to_plan_id TEXT
          CHECK (to_plan_id IS NULL OR to_plan_id IN ('sitecare-core', 'sitecare-plus', 'sitecare-pro')),
        status TEXT NOT NULL
          CHECK (status IN ('scheduled', 'applied', 'cancelled')),
        reason TEXT NOT NULL,
        requested_by TEXT NOT NULL,
        requested_at TIMESTAMPTZ NOT NULL,
        effective_at TIMESTAMPTZ NOT NULL,
        applied_at TIMESTAMPTZ,
        cancelled_at TIMESTAMPTZ,
        cancelled_by TEXT,
        cancellation_reason TEXT,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        CHECK (LENGTH(TRIM(reason)) > 0),
        CHECK (
          (status = 'scheduled' AND applied_at IS NULL AND cancelled_at IS NULL)
          OR
          (status = 'applied' AND applied_at IS NOT NULL AND cancelled_at IS NULL)
          OR
          (status = 'cancelled' AND cancelled_at IS NOT NULL)
        )
      );

      CREATE UNIQUE INDEX site_plan_transitions_one_scheduled
        ON site_plan_transitions(site_id)
        WHERE status = 'scheduled';

      CREATE INDEX site_plan_transitions_site_requested
        ON site_plan_transitions(site_id, requested_at DESC);

      CREATE TABLE site_entitlement_overrides (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        override_type TEXT NOT NULL
          CHECK (override_type IN (
            'service-exception', 'uptime-interval-minutes',
            'uptime-alert-threshold', 'long-term-backup-frequency'
          )),
        capability TEXT,
        value_json JSONB NOT NULL,
        reason TEXT NOT NULL,
        starts_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ,
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        expired_at TIMESTAMPTZ,
        removed_at TIMESTAMPTZ,
        removed_by TEXT,
        removal_reason TEXT,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        CHECK (LENGTH(TRIM(reason)) > 0),
        CHECK (expires_at IS NULL OR expires_at > starts_at),
        CHECK (expired_at IS NULL OR removed_at IS NULL)
      );

      CREATE INDEX site_entitlement_overrides_site_time
        ON site_entitlement_overrides(site_id, starts_at, expires_at)
        WHERE expired_at IS NULL AND removed_at IS NULL;

      CREATE TABLE site_service_activation_intents (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        capability TEXT NOT NULL,
        source_transition_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'acknowledged', 'cancelled')),
        eligible_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        acknowledged_at TIMESTAMPTZ,
        cancelled_at TIMESTAMPTZ,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        FOREIGN KEY (source_transition_id) REFERENCES site_plan_transitions(id) ON DELETE CASCADE,
        UNIQUE (site_id, capability, source_transition_id)
      );

      CREATE INDEX site_service_activation_intents_pending
        ON site_service_activation_intents(status, eligible_at ASC);

      INSERT INTO site_service_subscriptions (
        site_id, plan_id, status, service_started_at,
        annual_checkup_eligible_at, paid_through_at, cancelled_at,
        created_at, updated_at
      )
      SELECT
        id,
        'sitecare-core',
        'active',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        NULL,
        NULL,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      FROM sites
      ON CONFLICT (site_id) DO NOTHING;

      INSERT INTO site_plan_transitions (
        id, site_id, transition_type, from_plan_id, to_plan_id, status,
        reason, requested_by, requested_at, effective_at, applied_at,
        cancelled_at, cancelled_by, cancellation_reason
      )
      SELECT
        'migration-8:' || id,
        id,
        'initial-assignment',
        NULL,
        'sitecare-core',
        'applied',
        'Initial SiteCare Core assignment during Phase 3 migration.',
        'system:migration-8',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        NULL,
        NULL,
        NULL
      FROM sites
      ON CONFLICT (id) DO NOTHING;
    `
  },
  {
    id: 9,
    name: 'add_automation_jobs_schedules_and_transactional_notifications',
    sql: `
      CREATE TABLE automation_schedules (
        id TEXT PRIMARY KEY,
        site_id TEXT,
        name TEXT NOT NULL,
        job_type TEXT NOT NULL,
        operation_key TEXT NOT NULL,
        payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        interval_seconds INTEGER NOT NULL CHECK (interval_seconds >= 60),
        max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 20),
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        next_run_at TIMESTAMPTZ NOT NULL,
        last_enqueued_at TIMESTAMPTZ,
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        CHECK (LENGTH(TRIM(name)) > 0),
        CHECK (LENGTH(TRIM(job_type)) > 0),
        CHECK (LENGTH(TRIM(operation_key)) > 0)
      );

      CREATE INDEX automation_schedules_due
        ON automation_schedules(enabled, next_run_at ASC)
        WHERE enabled = TRUE;

      CREATE TABLE automation_jobs (
        id TEXT PRIMARY KEY,
        site_id TEXT,
        schedule_id TEXT,
        parent_job_id TEXT,
        job_type TEXT NOT NULL,
        operation_key TEXT NOT NULL,
        status TEXT NOT NULL
          CHECK (status IN (
            'queued', 'preflight', 'running', 'verifying', 'succeeded',
            'failed', 'needs-attention', 'cancelled'
          )),
        payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        idempotency_key TEXT NOT NULL UNIQUE,
        requested_by_type TEXT NOT NULL,
        requested_by TEXT NOT NULL,
        max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 20),
        attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
        available_at TIMESTAMPTZ NOT NULL,
        lease_token TEXT,
        lease_owner TEXT,
        lease_expires_at TIMESTAMPTZ,
        heartbeat_at TIMESTAMPTZ,
        cancellation_requested_at TIMESTAMPTZ,
        error_code TEXT,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        FOREIGN KEY (schedule_id) REFERENCES automation_schedules(id) ON DELETE SET NULL,
        FOREIGN KEY (parent_job_id) REFERENCES automation_jobs(id) ON DELETE SET NULL,
        CHECK (LENGTH(TRIM(job_type)) > 0),
        CHECK (LENGTH(TRIM(operation_key)) > 0),
        CHECK (
          (status IN ('preflight', 'running', 'verifying')
            AND lease_token IS NOT NULL
            AND lease_owner IS NOT NULL
            AND lease_expires_at IS NOT NULL)
          OR status NOT IN ('preflight', 'running', 'verifying')
        )
      );

      CREATE INDEX automation_jobs_claimable
        ON automation_jobs(status, available_at ASC, created_at ASC)
        WHERE status = 'queued';

      CREATE INDEX automation_jobs_site_created
        ON automation_jobs(site_id, created_at DESC);

      CREATE INDEX automation_jobs_active_lease
        ON automation_jobs(lease_expires_at ASC)
        WHERE status IN ('preflight', 'running', 'verifying');

      CREATE TABLE automation_job_attempts (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
        worker_id TEXT NOT NULL,
        status TEXT NOT NULL
          CHECK (status IN (
            'preflight', 'running', 'verifying', 'succeeded', 'failed',
            'interrupted', 'cancelled'
          )),
        started_at TIMESTAMPTZ NOT NULL,
        completed_at TIMESTAMPTZ,
        error_code TEXT,
        error_message TEXT,
        output_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        FOREIGN KEY (job_id) REFERENCES automation_jobs(id) ON DELETE CASCADE,
        UNIQUE (job_id, attempt_number)
      );

      CREATE INDEX automation_job_attempts_job_started
        ON automation_job_attempts(job_id, started_at DESC);

      CREATE TABLE automation_operation_locks (
        scope_key TEXT NOT NULL,
        operation_key TEXT NOT NULL,
        job_id TEXT NOT NULL,
        lease_token TEXT NOT NULL,
        lease_expires_at TIMESTAMPTZ NOT NULL,
        acquired_at TIMESTAMPTZ NOT NULL,
        heartbeat_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (scope_key, operation_key),
        FOREIGN KEY (job_id) REFERENCES automation_jobs(id) ON DELETE CASCADE
      );

      CREATE INDEX automation_operation_locks_expiry
        ON automation_operation_locks(lease_expires_at ASC);

      ALTER TABLE email_outbox
        DROP CONSTRAINT email_outbox_status_check;

      ALTER TABLE email_outbox
        ADD COLUMN site_id TEXT,
        ADD COLUMN notification_category TEXT NOT NULL DEFAULT 'authentication',
        ADD COLUMN provider TEXT NOT NULL DEFAULT 'brevo',
        ADD COLUMN recipient_name TEXT,
        ADD COLUMN template_key TEXT,
        ADD COLUMN metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN artifact_reference TEXT,
        ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 5,
        ADD COLUMN lease_token TEXT,
        ADD COLUMN lease_expires_at TIMESTAMPTZ,
        ADD COLUMN delivered_at TIMESTAMPTZ,
        ADD COLUMN bounced_at TIMESTAMPTZ,
        ADD COLUMN suppressed_at TIMESTAMPTZ,
        ADD COLUMN completed_at TIMESTAMPTZ,
        ADD COLUMN updated_at TIMESTAMPTZ;

      UPDATE email_outbox SET updated_at = created_at WHERE updated_at IS NULL;

      ALTER TABLE email_outbox
        ALTER COLUMN updated_at SET NOT NULL,
        ADD FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE SET NULL,
        ADD CHECK (notification_category IN (
          'authentication', 'backup', 'uptime', 'updates', 'sitehealth',
          'security', 'service', 'system'
        )),
        ADD CHECK (provider IN ('brevo', 'mailgun', 'postmark', 'sendgrid')),
        ADD CHECK (max_attempts BETWEEN 1 AND 20),
        ADD CHECK (status IN (
          'pending', 'sending', 'sent', 'delivered', 'failed',
          'bounced', 'suppressed', 'cancelled'
        ));

      DROP INDEX email_outbox_pending;
      CREATE INDEX email_outbox_pending
        ON email_outbox(status, available_at ASC, created_at ASC)
        WHERE status IN ('pending', 'failed');

      CREATE INDEX email_outbox_provider_message
        ON email_outbox(provider, provider_message_id)
        WHERE provider_message_id IS NOT NULL;

      CREATE INDEX email_outbox_site_created
        ON email_outbox(site_id, created_at DESC);

      CREATE TABLE email_global_settings (
        id TEXT PRIMARY KEY CHECK (id = 'global'),
        selected_provider TEXT NOT NULL DEFAULT 'brevo'
          CHECK (selected_provider IN ('brevo', 'mailgun', 'postmark', 'sendgrid')),
        from_address TEXT NOT NULL,
        from_name TEXT NOT NULL,
        reply_to TEXT,
        branding_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE email_provider_configurations (
        provider TEXT PRIMARY KEY
          CHECK (provider IN ('brevo', 'mailgun', 'postmark', 'sendgrid')),
        api_key_ciphertext TEXT,
        webhook_token_ciphertext TEXT,
        configuration_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE site_notification_recipients (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        email TEXT NOT NULL,
        display_name TEXT,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        UNIQUE (site_id, email),
        CHECK (LENGTH(TRIM(email)) > 3)
      );

      CREATE TABLE site_notification_subscriptions (
        recipient_id TEXT NOT NULL,
        category TEXT NOT NULL
          CHECK (category IN ('backup', 'uptime', 'updates', 'sitehealth', 'security', 'service')),
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (recipient_id, category),
        FOREIGN KEY (recipient_id) REFERENCES site_notification_recipients(id) ON DELETE CASCADE
      );

      CREATE TABLE email_suppressions (
        recipient_email TEXT PRIMARY KEY,
        reason TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        lifted_at TIMESTAMPTZ,
        lifted_by TEXT
      );

      CREATE TABLE email_delivery_events (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL
          CHECK (provider IN ('brevo', 'mailgun', 'postmark', 'sendgrid')),
        provider_event_id TEXT NOT NULL,
        provider_message_id TEXT,
        outbox_id TEXT,
        recipient_email TEXT NOT NULL,
        event_type TEXT NOT NULL,
        occurred_at TIMESTAMPTZ NOT NULL,
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (outbox_id) REFERENCES email_outbox(id) ON DELETE SET NULL,
        UNIQUE (provider, provider_event_id)
      );

      CREATE INDEX email_delivery_events_message
        ON email_delivery_events(provider, provider_message_id, occurred_at DESC);
    `
  },
  {
    id: 10,
    name: 'add_wordpress_connection_updates_and_hostinger_portfolio',
    sql: `
      ALTER TABLE site_credentials
        ADD COLUMN state TEXT NOT NULL DEFAULT 'active'
          CHECK (state IN ('active', 'pending', 'overlap', 'revoked')),
        ADD COLUMN valid_until TIMESTAMPTZ,
        ADD COLUMN confirmed_at TIMESTAMPTZ,
        ADD COLUMN last_used_at TIMESTAMPTZ,
        ADD COLUMN supersedes_credential_id TEXT;

      UPDATE site_credentials
      SET state = CASE WHEN revoked_at IS NULL THEN 'active' ELSE 'revoked' END;

      ALTER TABLE site_credentials
        ADD FOREIGN KEY (supersedes_credential_id) REFERENCES site_credentials(id) ON DELETE SET NULL;

      DROP INDEX site_credentials_active_site;
      CREATE UNIQUE INDEX site_credentials_one_active_site
        ON site_credentials(site_id)
        WHERE state = 'active' AND revoked_at IS NULL;
      CREATE UNIQUE INDEX site_credentials_one_pending_site
        ON site_credentials(site_id)
        WHERE state = 'pending' AND revoked_at IS NULL;
      CREATE INDEX site_credentials_accepted_site
        ON site_credentials(site_id, state, valid_until)
        WHERE revoked_at IS NULL;

      CREATE TABLE site_plugin_connections (
        site_id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'awaiting-check-in'
          CHECK (status IN ('awaiting-check-in', 'connected', 'stale', 'revoked')),
        contract_version INTEGER NOT NULL DEFAULT 1 CHECK (contract_version > 0),
        plugin_version TEXT,
        wordpress_home_url TEXT,
        last_authenticated_at TIMESTAMPTZ,
        last_check_in_at TIMESTAMPTZ,
        last_rotation_started_at TIMESTAMPTZ,
        last_rotation_completed_at TIMESTAMPTZ,
        rotation_due_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      );

      CREATE TABLE plugin_request_signatures (
        site_id TEXT NOT NULL,
        signature_hash TEXT NOT NULL,
        accepted_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (site_id, signature_hash),
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      );

      CREATE INDEX plugin_request_signatures_expiry
        ON plugin_request_signatures(expires_at);

      INSERT INTO site_plugin_connections (
        site_id, status, contract_version, last_authenticated_at,
        last_check_in_at, rotation_due_at, created_at, updated_at
      )
      SELECT
        sites.id,
        CASE WHEN latest.received_at IS NULL THEN 'awaiting-check-in' ELSE 'connected' END,
        1,
        latest.received_at,
        latest.received_at,
        active.created_at + INTERVAL '180 days',
        sites.created_at,
        CURRENT_TIMESTAMP
      FROM sites
      LEFT JOIN LATERAL (
        SELECT received_at
        FROM site_check_ins
        WHERE site_check_ins.site_id = sites.id
        ORDER BY received_at DESC
        LIMIT 1
      ) latest ON TRUE
      LEFT JOIN site_credentials active
        ON active.site_id = sites.id AND active.revoked_at IS NULL
      ON CONFLICT (site_id) DO NOTHING;

      CREATE TABLE wordpress_update_snapshots (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        check_in_id TEXT NOT NULL UNIQUE,
        contract_version INTEGER NOT NULL CHECK (contract_version > 0),
        checked_at TIMESTAMPTZ NOT NULL,
        received_at TIMESTAMPTZ NOT NULL,
        core_installed_version TEXT NOT NULL,
        core_available_version TEXT,
        plugin_count INTEGER NOT NULL CHECK (plugin_count >= 0),
        theme_count INTEGER NOT NULL CHECK (theme_count >= 0),
        pending_update_count INTEGER NOT NULL CHECK (pending_update_count >= 0),
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        FOREIGN KEY (check_in_id) REFERENCES site_check_ins(id) ON DELETE CASCADE
      );

      CREATE INDEX wordpress_update_snapshots_site_checked
        ON wordpress_update_snapshots(site_id, checked_at DESC, received_at DESC);

      CREATE TABLE wordpress_update_inventory_items (
        snapshot_id TEXT NOT NULL,
        site_id TEXT NOT NULL,
        component_type TEXT NOT NULL CHECK (component_type IN ('core', 'plugin', 'theme')),
        slug TEXT NOT NULL,
        name TEXT NOT NULL,
        installed_version TEXT NOT NULL,
        available_version TEXT,
        active BOOLEAN NOT NULL DEFAULT FALSE,
        auto_update_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        support_status TEXT NOT NULL DEFAULT 'unknown'
          CHECK (support_status IN ('supported', 'possibly-abandoned', 'unknown')),
        premium_license_status TEXT NOT NULL DEFAULT 'unknown'
          CHECK (premium_license_status IN ('active', 'inactive', 'unknown', 'not-applicable')),
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        PRIMARY KEY (snapshot_id, component_type, slug),
        FOREIGN KEY (snapshot_id) REFERENCES wordpress_update_snapshots(id) ON DELETE CASCADE,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      );

      CREATE INDEX wordpress_update_inventory_site_component
        ON wordpress_update_inventory_items(site_id, component_type, slug);

      CREATE TABLE wordpress_update_activities (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        source_event_id TEXT NOT NULL,
        component_type TEXT NOT NULL CHECK (component_type IN ('core', 'plugin', 'theme')),
        slug TEXT NOT NULL,
        name TEXT NOT NULL,
        prior_version TEXT,
        target_version TEXT,
        resulting_version TEXT,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('succeeded', 'failed', 'observed')),
        error_code TEXT,
        error_message TEXT,
        source TEXT NOT NULL CHECK (source IN ('wordpress-upgrader', 'wordpress-automatic-updater', 'inventory-reconciliation')),
        recorded_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        UNIQUE (site_id, source_event_id)
      );

      CREATE INDEX wordpress_update_activities_site_completed
        ON wordpress_update_activities(site_id, completed_at DESC);

      CREATE TABLE hostinger_site_connections (
        site_id TEXT PRIMARY KEY,
        availability TEXT NOT NULL DEFAULT 'not-synchronized'
          CHECK (availability IN ('available', 'not-found', 'not-configured', 'not-synchronized', 'provider-error')),
        domain TEXT NOT NULL,
        account_username TEXT,
        website_order_id TEXT,
        wordpress_installation_id TEXT,
        website_enabled BOOLEAN,
        wordpress_valid BOOLEAN,
        root_directory TEXT,
        management_url TEXT,
        daily_backup_availability TEXT NOT NULL DEFAULT 'not-available'
          CHECK (daily_backup_availability IN ('available', 'not-available')),
        latest_daily_backup_at TIMESTAMPTZ,
        daily_backup_message TEXT,
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        last_synced_at TIMESTAMPTZ,
        last_error_code TEXT,
        last_error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      );

      CREATE INDEX hostinger_site_connections_availability
        ON hostinger_site_connections(availability, updated_at DESC);
    `
  },
  {
    id: 11,
    name: 'add_cloudflare_uptime_incidents_and_security_evidence',
    sql: `
      CREATE TABLE cloudflare_site_connections (
        site_id TEXT PRIMARY KEY,
        zone_id TEXT,
        zone_name TEXT,
        account_id TEXT,
        availability TEXT NOT NULL DEFAULT 'not-synchronized'
          CHECK (availability IN ('available', 'not-found', 'not-configured', 'not-synchronized', 'provider-error')),
        homepage_url TEXT NOT NULL,
        health_check_id TEXT,
        health_check_name TEXT,
        health_check_status TEXT,
        normal_interval_seconds INTEGER NOT NULL DEFAULT 300
          CHECK (normal_interval_seconds BETWEEN 60 AND 86400),
        alert_failure_threshold INTEGER NOT NULL DEFAULT 2
          CHECK (alert_failure_threshold BETWEEN 1 AND 20),
        capabilities_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        last_synced_at TIMESTAMPTZ,
        last_error_code TEXT,
        last_error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      );

      CREATE INDEX cloudflare_site_connections_zone
        ON cloudflare_site_connections(zone_id)
        WHERE zone_id IS NOT NULL;

      CREATE TABLE uptime_incidents (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        health_check_id TEXT,
        status TEXT NOT NULL CHECK (status IN ('open', 'recovered')),
        started_at TIMESTAMPTZ NOT NULL,
        confirmed_at TIMESTAMPTZ NOT NULL,
        recovered_at TIMESTAMPTZ,
        duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
        failure_count INTEGER NOT NULL DEFAULT 2 CHECK (failure_count > 0),
        initial_reason TEXT,
        final_reason TEXT,
        recovery_notes TEXT,
        restored_backup_reference TEXT,
        alert_queued_at TIMESTAMPTZ,
        recovery_report_queued_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX uptime_incidents_one_open_site
        ON uptime_incidents(site_id)
        WHERE status = 'open';
      CREATE INDEX uptime_incidents_site_started
        ON uptime_incidents(site_id, started_at DESC);

      CREATE TABLE uptime_monitor_state (
        site_id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'not-configured'
          CHECK (status IN ('not-configured', 'disabled', 'healthy', 'first-failure', 'incident', 'maintenance', 'provider-error')),
        consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
        first_failure_at TIMESTAMPTZ,
        first_failure_provider_event_id TEXT,
        last_failure_at TIMESTAMPTZ,
        last_failure_reason TEXT,
        last_success_at TIMESTAMPTZ,
        current_interval_seconds INTEGER NOT NULL DEFAULT 300
          CHECK (current_interval_seconds BETWEEN 60 AND 86400),
        active_incident_id TEXT,
        last_reconciled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        FOREIGN KEY (active_incident_id) REFERENCES uptime_incidents(id) ON DELETE SET NULL
      );

      CREATE TABLE uptime_observations (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        incident_id TEXT,
        provider_event_id TEXT,
        source TEXT NOT NULL CHECK (source IN ('cloudflare-webhook', 'cloudflare-reconciliation')),
        status TEXT NOT NULL CHECK (status IN ('healthy', 'unhealthy', 'tls-error', 'unknown', 'maintenance')),
        reason TEXT,
        excluded_from_downtime BOOLEAN NOT NULL DEFAULT FALSE,
        observed_at TIMESTAMPTZ NOT NULL,
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        FOREIGN KEY (incident_id) REFERENCES uptime_incidents(id) ON DELETE SET NULL,
        UNIQUE (provider_event_id)
      );

      CREATE INDEX uptime_observations_site_observed
        ON uptime_observations(site_id, observed_at DESC);
      CREATE INDEX uptime_observations_retention
        ON uptime_observations(observed_at ASC);

      CREATE TABLE uptime_tls_alerts (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
        opened_at TIMESTAMPTZ NOT NULL,
        resolved_at TIMESTAMPTZ,
        reason TEXT NOT NULL,
        alert_queued_at TIMESTAMPTZ,
        resolution_queued_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX uptime_tls_alerts_one_open_site
        ON uptime_tls_alerts(site_id)
        WHERE status = 'open';

      CREATE TABLE uptime_maintenance_windows (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        starts_at TIMESTAMPTZ NOT NULL,
        ends_at TIMESTAMPTZ NOT NULL,
        reason TEXT NOT NULL,
        created_by TEXT NOT NULL,
        cancelled_at TIMESTAMPTZ,
        cancelled_by TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        CHECK (ends_at > starts_at)
      );

      CREATE INDEX uptime_maintenance_windows_site_time
        ON uptime_maintenance_windows(site_id, starts_at, ends_at);

      CREATE TABLE cloudflare_security_syncs (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        zone_id TEXT,
        checked_at TIMESTAMPTZ NOT NULL,
        capability_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        warning_count INTEGER NOT NULL DEFAULT 0 CHECK (warning_count >= 0),
        created_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      );

      CREATE INDEX cloudflare_security_syncs_site_checked
        ON cloudflare_security_syncs(site_id, checked_at DESC);

      CREATE TABLE cloudflare_security_evidence (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        sync_id TEXT,
        control_key TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'pending', 'review', 'unavailable')),
        source TEXT NOT NULL CHECK (source IN ('cloudflare-api', 'technician', 'informational')),
        summary TEXT NOT NULL,
        notes TEXT,
        evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        observed_at TIMESTAMPTZ NOT NULL,
        actor_identifier TEXT,
        superseded_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        FOREIGN KEY (sync_id) REFERENCES cloudflare_security_syncs(id) ON DELETE CASCADE
      );

      CREATE INDEX cloudflare_security_evidence_effective
        ON cloudflare_security_evidence(site_id, control_key, source, observed_at DESC)
        WHERE superseded_at IS NULL;
    `
  },
  {
    id: 12,
    name: 'add_sitecare_pro_portable_backup_operations',
    sql: `
      ALTER TABLE backup_policies
        ADD COLUMN retention_months INTEGER NOT NULL DEFAULT 24
          CHECK (retention_months BETWEEN 1 AND 120),
        ADD COLUMN next_due_at TIMESTAMPTZ,
        ADD COLUMN last_scheduled_period TEXT;

      UPDATE backup_policies
      SET frequency = 'monthly',
          files_enabled = TRUE,
          database_enabled = TRUE,
          keep_daily = 0,
          keep_weekly = 0,
          keep_monthly = 24,
          retention_months = 24,
          restore_requires_confirmation = TRUE;

      UPDATE site_backup_destination_settings SET allow_multiple = FALSE;
      DELETE FROM site_backup_destination_assignments assignment
      WHERE EXISTS (
        SELECT 1
        FROM site_backup_destination_assignments earlier
        WHERE earlier.site_id = assignment.site_id
          AND earlier.priority < assignment.priority
      );

      ALTER TABLE hosting_connections
        ADD COLUMN remote_host TEXT,
        ADD COLUMN remote_port INTEGER CHECK (remote_port IS NULL OR remote_port BETWEEN 1 AND 65535),
        ADD COLUMN remote_username TEXT,
        ADD COLUMN remote_root_path TEXT,
        ADD COLUMN authentication_type TEXT NOT NULL DEFAULT 'none'
          CHECK (authentication_type IN ('none', 'ssh-private-key')),
        ADD COLUMN credential_ciphertext TEXT,
        ADD COLUMN credential_version INTEGER NOT NULL DEFAULT 0 CHECK (credential_version >= 0),
        ADD COLUMN host_key TEXT,
        ADD COLUMN connection_status TEXT NOT NULL DEFAULT 'not-tested'
          CHECK (connection_status IN ('not-tested', 'ready', 'failed', 'quarantined')),
        ADD COLUMN last_tested_at TIMESTAMPTZ,
        ADD COLUMN last_error_code TEXT,
        ADD COLUMN last_error_message TEXT;

      UPDATE hosting_connections
      SET connection_status = CASE
        WHEN connection_type = 'local-vps' THEN 'quarantined'
        ELSE 'not-tested'
      END,
      last_error_code = CASE
        WHEN connection_type = 'local-vps' THEN 'legacy-local-source'
        ELSE NULL
      END,
      last_error_message = CASE
        WHEN connection_type = 'local-vps' THEN 'Legacy local paths require an explicit worker mount and are not valid Hostinger shared-hosting sources.'
        ELSE NULL
      END;

      CREATE TABLE backup_client_folders (
        client_account_id TEXT PRIMARY KEY,
        folder_name TEXT NOT NULL UNIQUE,
        original_client_name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (client_account_id) REFERENCES client_accounts(id) ON DELETE RESTRICT,
        CHECK (LENGTH(TRIM(folder_name)) > 0)
      );

      ALTER TABLE backup_artifacts
        ADD COLUMN client_folder TEXT,
        ADD COLUMN package_prefix TEXT,
        ADD COLUMN schedule_period TEXT,
        ADD COLUMN retention_state TEXT NOT NULL DEFAULT 'retained'
          CHECK (retention_state IN ('retained', 'expiration-due', 'deletion-approved', 'deleted', 'deletion-failed')),
        ADD COLUMN expired_at TIMESTAMPTZ,
        ADD COLUMN deleted_at TIMESTAMPTZ;

      CREATE UNIQUE INDEX backup_artifacts_scheduled_period
        ON backup_artifacts(site_id, schedule_period)
        WHERE backup_type = 'scheduled' AND schedule_period IS NOT NULL;

      CREATE INDEX backup_artifacts_retention_due
        ON backup_artifacts(expires_at ASC)
        WHERE status = 'completed' AND retention_state = 'retained' AND expires_at IS NOT NULL;

      CREATE TABLE backup_artifact_objects (
        id TEXT PRIMARY KEY,
        backup_id TEXT NOT NULL,
        destination_id TEXT NOT NULL,
        artifact_type TEXT NOT NULL
          CHECK (artifact_type IN ('files', 'database', 'manifest', 'checksums', 'readme')),
        object_path TEXT NOT NULL,
        archive_name TEXT NOT NULL,
        size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
        checksum_sha256 TEXT NOT NULL,
        upload_status TEXT NOT NULL
          CHECK (upload_status IN ('uploaded', 'verified', 'failed', 'deleted')),
        uploaded_at TIMESTAMPTZ,
        verified_at TIMESTAMPTZ,
        deleted_at TIMESTAMPTZ,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (backup_id) REFERENCES backup_artifacts(id) ON DELETE CASCADE,
        FOREIGN KEY (destination_id) REFERENCES backup_destinations(id) ON DELETE RESTRICT,
        UNIQUE (backup_id, destination_id, object_path)
      );

      CREATE INDEX backup_artifact_objects_backup_destination
        ON backup_artifact_objects(backup_id, destination_id, artifact_type);

      CREATE TABLE backup_retention_runs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL
          CHECK (status IN ('dry-run', 'approved', 'completed', 'failed')),
        candidate_count INTEGER NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
        candidate_backup_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        requested_by TEXT NOT NULL,
        approved_by TEXT,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        approved_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ
      );

      ALTER TABLE backup_destinations
        ADD COLUMN last_tested_at TIMESTAMPTZ,
        ADD COLUMN last_connection_status TEXT
          CHECK (last_connection_status IS NULL OR last_connection_status IN ('connected', 'failed', 'revoked')),
        ADD COLUMN last_error_code TEXT,
        ADD COLUMN last_error_message TEXT;

      CREATE TABLE backup_destination_oauth_states (
        state_hash TEXT PRIMARY KEY,
        destination_id TEXT NOT NULL,
        initiated_by TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (destination_id) REFERENCES backup_destinations(id) ON DELETE CASCADE
      );

      CREATE INDEX backup_destination_oauth_states_expiry
        ON backup_destination_oauth_states(expires_at ASC)
        WHERE consumed_at IS NULL;

      ALTER TABLE restore_plans
        ADD COLUMN checklist_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN technician_notes TEXT,
        ADD COLUMN target_host_label TEXT,
        ADD COLUMN download_verified_at TIMESTAMPTZ,
        ADD COLUMN restoration_started_at TIMESTAMPTZ,
        ADD COLUMN restoration_completed_at TIMESTAMPTZ,
        ADD COLUMN completed_by TEXT,
        ADD COLUMN outcome TEXT;
    `
  },
  {
    id: 13,
    name: 'add_sitehealth_checkups_reviews_and_approval_boundary',
    sql: `
      CREATE TABLE sitehealth_checkups (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        trigger_type TEXT NOT NULL CHECK (trigger_type IN ('manual', 'annual')),
        annual_cycle_date DATE,
        status TEXT NOT NULL
          CHECK (status IN ('queued', 'running', 'draft-ready', 'failed', 'cancelled')),
        include_broken_links BOOLEAN NOT NULL DEFAULT FALSE,
        requested_by_type TEXT NOT NULL,
        requested_by TEXT NOT NULL,
        automation_job_id TEXT,
        evidence_check_in_id TEXT,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        FOREIGN KEY (automation_job_id) REFERENCES automation_jobs(id) ON DELETE SET NULL,
        FOREIGN KEY (evidence_check_in_id) REFERENCES site_check_ins(id) ON DELETE SET NULL,
        CHECK (
          (trigger_type = 'annual' AND annual_cycle_date IS NOT NULL)
          OR (trigger_type = 'manual' AND annual_cycle_date IS NULL)
        )
      );

      CREATE UNIQUE INDEX sitehealth_checkups_one_annual_cycle
        ON sitehealth_checkups(site_id, annual_cycle_date)
        WHERE trigger_type = 'annual';

      CREATE INDEX sitehealth_checkups_site_created
        ON sitehealth_checkups(site_id, created_at DESC);

      CREATE INDEX sitehealth_checkups_work_queue
        ON sitehealth_checkups(status, created_at ASC)
        WHERE status IN ('queued', 'running');

      CREATE TABLE sitehealth_annual_policies (
        site_id TEXT PRIMARY KEY,
        enabled BOOLEAN NOT NULL DEFAULT FALSE,
        eligible_at TIMESTAMPTZ,
        next_due_at TIMESTAMPTZ,
        last_completed_at TIMESTAMPTZ,
        last_checkup_id TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        FOREIGN KEY (last_checkup_id) REFERENCES sitehealth_checkups(id) ON DELETE SET NULL
      );

      CREATE INDEX sitehealth_annual_policies_due
        ON sitehealth_annual_policies(next_due_at ASC)
        WHERE enabled = TRUE AND next_due_at IS NOT NULL;

      CREATE TABLE sitehealth_evidence (
        id TEXT PRIMARY KEY,
        checkup_id TEXT NOT NULL,
        site_id TEXT NOT NULL,
        area TEXT NOT NULL
          CHECK (area IN ('performance', 'content', 'media', 'users', 'plugins-themes', 'environment', 'database', 'backups', 'updates')),
        metric_key TEXT NOT NULL,
        source TEXT NOT NULL,
        availability TEXT NOT NULL CHECK (availability IN ('available', 'unavailable', 'error')),
        summary TEXT NOT NULL,
        value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        observed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (checkup_id) REFERENCES sitehealth_checkups(id) ON DELETE CASCADE,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        UNIQUE (checkup_id, metric_key)
      );

      CREATE INDEX sitehealth_evidence_checkup_area
        ON sitehealth_evidence(checkup_id, area, metric_key);

      CREATE TABLE sitehealth_findings (
        id TEXT PRIMARY KEY,
        checkup_id TEXT NOT NULL,
        site_id TEXT NOT NULL,
        evidence_id TEXT,
        area TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        severity TEXT NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high')),
        origin TEXT NOT NULL CHECK (origin IN ('automated', 'technician')),
        status TEXT NOT NULL CHECK (status IN ('active', 'dismissed')),
        technician_notes TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (checkup_id) REFERENCES sitehealth_checkups(id) ON DELETE CASCADE,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        FOREIGN KEY (evidence_id) REFERENCES sitehealth_evidence(id) ON DELETE SET NULL
      );

      CREATE INDEX sitehealth_findings_checkup_status
        ON sitehealth_findings(checkup_id, status, sort_order, created_at);

      CREATE TABLE sitehealth_recommendations (
        id TEXT PRIMARY KEY,
        checkup_id TEXT NOT NULL,
        site_id TEXT NOT NULL,
        area TEXT NOT NULL,
        action_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
        status TEXT NOT NULL CHECK (status IN ('proposed', 'dismissed')),
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (checkup_id) REFERENCES sitehealth_checkups(id) ON DELETE CASCADE,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      );

      CREATE INDEX sitehealth_recommendations_checkup_status
        ON sitehealth_recommendations(checkup_id, status, priority, created_at);

      CREATE TABLE sitehealth_reviews (
        id TEXT PRIMARY KEY,
        checkup_id TEXT NOT NULL,
        site_id TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version > 0),
        status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'sent', 'superseded')),
        title TEXT NOT NULL,
        executive_summary TEXT NOT NULL,
        content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_by TEXT NOT NULL,
        published_by TEXT,
        published_at TIMESTAMPTZ,
        sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (checkup_id) REFERENCES sitehealth_checkups(id) ON DELETE CASCADE,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        UNIQUE (checkup_id, version)
      );

      CREATE INDEX sitehealth_reviews_site_created
        ON sitehealth_reviews(site_id, created_at DESC);

      CREATE TABLE sitehealth_approvals (
        id TEXT PRIMARY KEY,
        review_id TEXT NOT NULL,
        site_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('approved-all', 'declined', 'partial')),
        source TEXT NOT NULL CHECK (source IN ('external-email', 'phone', 'other')),
        notes TEXT NOT NULL,
        recorded_by TEXT NOT NULL,
        recorded_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (review_id) REFERENCES sitehealth_reviews(id) ON DELETE RESTRICT,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      );

      CREATE INDEX sitehealth_approvals_review_recorded
        ON sitehealth_approvals(review_id, recorded_at DESC);

      CREATE TABLE sitehealth_cleanup_proposals (
        id TEXT PRIMARY KEY,
        review_id TEXT NOT NULL,
        recommendation_id TEXT NOT NULL,
        site_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        status TEXT NOT NULL
          CHECK (status IN ('proposed', 'approved', 'initiated', 'completed', 'cancelled')),
        approval_id TEXT,
        technician_notes TEXT,
        initiated_by TEXT,
        initiated_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (review_id) REFERENCES sitehealth_reviews(id) ON DELETE RESTRICT,
        FOREIGN KEY (recommendation_id) REFERENCES sitehealth_recommendations(id) ON DELETE RESTRICT,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        FOREIGN KEY (approval_id) REFERENCES sitehealth_approvals(id) ON DELETE RESTRICT,
        UNIQUE (review_id, recommendation_id),
        CHECK (status = 'proposed' OR approval_id IS NOT NULL),
        CHECK (status <> 'initiated' OR (initiated_by IS NOT NULL AND initiated_at IS NOT NULL))
      );

      CREATE INDEX sitehealth_cleanup_proposals_site_status
        ON sitehealth_cleanup_proposals(site_id, status, created_at DESC);
    `
  },
  {
    id: 14,
    name: 'add_mfa_step_up_and_central_plugin_rollouts',
    sql: `
      ALTER TABLE user_mfa_factors
        ADD COLUMN last_used_at TIMESTAMPTZ;

      CREATE TABLE plugin_update_packages (
        id TEXT PRIMARY KEY,
        plugin_slug TEXT NOT NULL,
        plugin_name TEXT NOT NULL,
        version TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        checksum_sha256 TEXT NOT NULL,
        size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
        storage_path TEXT NOT NULL,
        validation_status TEXT NOT NULL
          CHECK (validation_status IN ('validated', 'rejected', 'quarantined')),
        scan_status TEXT NOT NULL
          CHECK (scan_status IN ('structural-passed', 'external-passed', 'external-unavailable', 'failed')),
        provenance_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        manifest_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        uploaded_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        UNIQUE (checksum_sha256)
      );

      CREATE INDEX plugin_update_packages_slug_version
        ON plugin_update_packages(plugin_slug, version, created_at DESC);

      CREATE TABLE site_recovery_evidence (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('sitecare-backup', 'hostinger-technician-confirmed')),
        backup_reference TEXT NOT NULL,
        backup_completed_at TIMESTAMPTZ NOT NULL,
        valid_until TIMESTAMPTZ NOT NULL,
        notes TEXT,
        confirmed_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
      );

      CREATE INDEX site_recovery_evidence_site_valid
        ON site_recovery_evidence(site_id, valid_until DESC);

      CREATE TABLE plugin_update_rollouts (
        id TEXT PRIMARY KEY,
        package_id TEXT NOT NULL,
        action_request_id TEXT,
        status TEXT NOT NULL
          CHECK (status IN ('draft', 'approved', 'canary-running', 'paused', 'running', 'completed', 'failed', 'cancelled')),
        canary_size INTEGER NOT NULL DEFAULT 1 CHECK (canary_size BETWEEN 1 AND 20),
        failure_threshold INTEGER NOT NULL DEFAULT 1 CHECK (failure_threshold BETWEEN 1 AND 20),
        concurrency_limit INTEGER NOT NULL DEFAULT 2 CHECK (concurrency_limit BETWEEN 1 AND 20),
        halt_reason TEXT,
        created_by TEXT NOT NULL,
        confirmed_by TEXT,
        confirmed_at TIMESTAMPTZ,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (package_id) REFERENCES plugin_update_packages(id) ON DELETE RESTRICT,
        FOREIGN KEY (action_request_id) REFERENCES action_requests(id) ON DELETE RESTRICT
      );

      CREATE INDEX plugin_update_rollouts_status_created
        ON plugin_update_rollouts(status, created_at DESC);

      CREATE TABLE plugin_update_targets (
        id TEXT PRIMARY KEY,
        rollout_id TEXT NOT NULL,
        site_id TEXT NOT NULL,
        plugin_file TEXT,
        installed_version TEXT,
        target_version TEXT NOT NULL,
        resulting_version TEXT,
        category TEXT NOT NULL
          CHECK (category IN ('eligible', 'current', 'not-installed', 'disconnected', 'suspended', 'incompatible', 'recovery-required')),
        selected BOOLEAN NOT NULL DEFAULT FALSE,
        recovery_ready BOOLEAN NOT NULL DEFAULT FALSE,
        recovery_evidence_id TEXT,
        preflight_status TEXT NOT NULL DEFAULT 'pending'
          CHECK (preflight_status IN ('pending', 'passed', 'blocked')),
        preflight_message TEXT,
        batch_number INTEGER,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'queued', 'running', 'succeeded', 'failed', 'skipped', 'needs-attention')),
        automation_job_id TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        error_code TEXT,
        error_message TEXT,
        response_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (rollout_id) REFERENCES plugin_update_rollouts(id) ON DELETE CASCADE,
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE,
        FOREIGN KEY (recovery_evidence_id) REFERENCES site_recovery_evidence(id) ON DELETE RESTRICT,
        FOREIGN KEY (automation_job_id) REFERENCES automation_jobs(id) ON DELETE SET NULL,
        UNIQUE (rollout_id, site_id)
      );

      CREATE INDEX plugin_update_targets_rollout_status
        ON plugin_update_targets(rollout_id, batch_number, status, created_at);

      CREATE TABLE plugin_package_download_tokens (
        token_hash TEXT PRIMARY KEY,
        package_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        FOREIGN KEY (package_id) REFERENCES plugin_update_packages(id) ON DELETE CASCADE,
        FOREIGN KEY (target_id) REFERENCES plugin_update_targets(id) ON DELETE CASCADE
      );

      CREATE INDEX plugin_package_download_tokens_expiry
        ON plugin_package_download_tokens(expires_at ASC)
        WHERE used_at IS NULL;
    `
  }
]

async function applyPendingMigrations(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL
    )
  `)

  const result = await client.query<{ id: number }>('SELECT id FROM schema_migrations')
  const applied = new Set(result.rows.map(row => row.id))

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue
    await client.query(migration.sql)
    await client.query(
      'INSERT INTO schema_migrations (id, name, applied_at) VALUES ($1, $2, $3)',
      [migration.id, migration.name, new Date().toISOString()]
    )
  }
}

export async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query("SELECT pg_advisory_xact_lock(hashtext('ap-sitecare-schema-migrations'))")
    await applyPendingMigrations(client)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
