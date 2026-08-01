import type { RuntimeSettings } from '../utils/config'
import { useDatabase, type QueryExecutor } from '../utils/database'

interface CountRow { count: string }

export class OperationalHealthService {
  constructor(
    private readonly settings: RuntimeSettings,
    private readonly database: QueryExecutor = useDatabase()
  ) {}

  async inspect() {
    const now = new Date().toISOString()
    const staleLease = new Date(Date.now() - 5 * 60_000).toISOString()
    const [migration, jobs, staleJobs, backups, staleBackups, email, staleEmail, integrations, sites] = await Promise.all([
      this.database.query<{ id: number, name: string, applied_at: string }>('SELECT * FROM schema_migrations ORDER BY id DESC LIMIT 1'),
      this.count(`SELECT COUNT(*)::text AS count FROM automation_jobs WHERE status IN ('failed','needs-attention')`),
      this.count(`SELECT COUNT(*)::text AS count FROM automation_jobs WHERE status IN ('preflight','running','verifying') AND COALESCE(heartbeat_at, updated_at, started_at, created_at) < $1`, [staleLease]),
      this.count(`SELECT COUNT(*)::text AS count FROM backup_jobs WHERE status='failed'`),
      this.count(`SELECT COUNT(*)::text AS count FROM backup_jobs WHERE status='running' AND COALESCE(heartbeat_at, claimed_at, started_at, created_at) < $1`, [staleLease]),
      this.count(`SELECT COUNT(*)::text AS count FROM email_outbox WHERE status='failed'`),
      this.count(`SELECT COUNT(*)::text AS count FROM email_outbox WHERE status='sending' AND claimed_at < $1`, [staleLease]),
      this.database.query<{
        hostinger_errors: number, cloudflare_errors: number, destination_failures: number,
        open_tls_alerts: number, open_uptime_incidents: number
      }>(`
        SELECT
          (SELECT COUNT(*) FROM hostinger_site_connections WHERE last_error_code IS NOT NULL)::int AS hostinger_errors,
          (SELECT COUNT(*) FROM cloudflare_site_connections WHERE last_error_code IS NOT NULL)::int AS cloudflare_errors,
          (SELECT COUNT(*) FROM backup_destinations WHERE last_connection_status='failed')::int AS destination_failures,
          (SELECT COUNT(*) FROM uptime_tls_alerts WHERE status='open')::int AS open_tls_alerts,
          (SELECT COUNT(*) FROM uptime_incidents WHERE status='open')::int AS open_uptime_incidents
      `),
      this.count(`SELECT COUNT(*)::text AS count FROM sites WHERE status='active'`)
    ])
    const integration = integrations.rows[0]!
    const components = {
      automation: status(Number(jobs), Number(staleJobs)),
      backupWorker: status(Number(backups), Number(staleBackups)),
      emailWorker: status(Number(email), Number(staleEmail)),
      hostinger: status(integration.hostinger_errors, 0),
      cloudflare: status(integration.cloudflare_errors, 0),
      backupDestinations: status(integration.destination_failures, 0)
    }
    const attentionCount = Object.values(components).filter(component => component.status !== 'healthy').length
    return {
      checkedAt: now,
      status: attentionCount ? 'attention' : 'healthy',
      database: { status: 'healthy', migration: migration.rows[0] ?? null, activeSiteCount: Number(sites) },
      components,
      incidents: { openUptime: integration.open_uptime_incidents, openTls: integration.open_tls_alerts },
      configuration: {
        credentialEncryptionKey: Boolean(this.settings.credentialEncryptionKey),
        authEventHashKey: Boolean(this.settings.auth.eventHashKey),
        secureCookies: this.settings.auth.secureCookies || process.env.NODE_ENV === 'production',
        emailApi: Boolean(this.settings.email.brevoApiKey),
        cloudflareApi: Boolean(this.settings.integrations.cloudflareApiToken),
        dropboxOAuth: Boolean(this.settings.integrations.dropboxRefreshToken && this.settings.integrations.dropboxAppKey && this.settings.integrations.dropboxAppSecret),
        hostingerApi: Boolean(this.settings.integrations.hostingerApiToken)
      }
    }
  }

  private async count(sql: string, values: unknown[] = []): Promise<number> {
    const result = await this.database.query<CountRow>(sql, values)
    return Number(result.rows[0]?.count ?? 0)
  }
}

function status(failed: number, stale: number): { status: 'healthy' | 'attention' | 'critical', failed: number, stale: number } {
  return { status: stale > 0 ? 'critical' : failed > 0 ? 'attention' : 'healthy', failed, stale }
}
