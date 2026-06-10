import type { AuditEvent, HealthStatus } from '../domain/types'
import { AuditService } from './audit-service'
import { HealthService } from './health-service'
import { SiteService } from './site-service'

const activityLabels: Record<string, string> = {
  'check-in.received': 'Site health check completed',
  'wordpress.updated': 'WordPress update completed',
  'plugin-updates.installed': 'Plugin updates completed',
  'theme-updates.installed': 'Theme updates completed',
  'backup.completed': 'Backup completed',
  'offsite-archive.completed': 'Offsite archive completed',
  'security-scan.completed': 'Security check completed',
  'uptime-check.completed': 'Uptime check completed'
}

function mapActivity(event: AuditEvent) {
  return {
    id: event.id,
    type: event.eventType,
    label: activityLabels[event.eventType] ?? event.eventType.split('.').join(' '),
    createdAt: event.createdAt
  }
}

function clientStatus(status: HealthStatus): 'protected' | 'attention' | 'unknown' {
  if (status === 'healthy') return 'protected'
  if (status === 'attention' || status === 'critical') return 'attention'
  return 'unknown'
}

export class PluginClientSummaryService {
  constructor(
    private readonly siteService = new SiteService(),
    private readonly healthService = new HealthService(),
    private readonly auditService = new AuditService()
  ) {}

  get(siteId: string) {
    const site = this.siteService.get(siteId)
    const health = this.healthService.getSummary(siteId)
    const recentActivity = this.auditService
      .listForSite(siteId)
      .filter(event => Object.hasOwn(activityLabels, event.eventType))
      .slice(0, 8)
      .map(mapActivity)

    return {
      site: {
        name: site.name,
        backupRetentionNote: site.backupStrategy
      },
      overall: {
        status: clientStatus(health.status),
        reason: health.reason,
        checkedAt: health.latest?.createdAt ?? null
      },
      recentActivity,
      security: {
        status: 'unknown',
        threatsBlockedThisMonth: null,
        loginAttemptsBlocked: null,
        suspiciousRequestsBlocked: null,
        lastCheckedAt: null
      },
      backups: {
        status: 'unknown',
        lastDailyBackupAt: null,
        lastOffsiteArchiveAt: null,
        retentionNote: site.backupStrategy
      },
      uptime: {
        status: 'unknown',
        lastCheckedAt: null,
        thirtyDayPercentage: null
      },
      serviceTime: null
    }
  }
}
