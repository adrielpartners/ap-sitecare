import type {
  DashboardAggregates,
  HealthStatus,
  ManagedSiteOverview,
  OperationalSignalStatus,
  RecentActivity,
  ScheduledTask
} from '../domain/types'
import { AuditService } from './audit-service'
import { HealthService } from './health-service'
import { ScheduledTaskService } from './scheduled-task-service'
import { SiteService } from './site-service'

export interface DashboardOverview {
  aggregates: DashboardAggregates
  sites: {
    items: ManagedSiteOverview[]
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
  recentActivity: RecentActivity[]
  scheduledTasks: ScheduledTask[]
}

const activityLabels: Record<string, string> = {
  'site.created': 'Site added',
  'check-in.received': 'Check-in received',
  'wordpress.updated': 'WordPress updated',
  'plugins.updated': 'Plugin updates installed',
  'backup.completed': 'Backup completed',
  'security-scan.completed': 'Security scan completed',
  'uptime-check.completed': 'Uptime check completed',
  'credential.rotated': 'Token rotated',
  'credential.issued': 'Site token issued',
  'site.updated': 'Site details updated',
  'site.disabled': 'Site disabled'
}

function distribution(counts: Record<HealthStatus, number>, total: number): Record<HealthStatus, number> {
  if (total === 0) return { healthy: 0, attention: 0, critical: 0, unknown: 0 }
  return {
    healthy: Math.round((counts.healthy / total) * 100),
    attention: Math.round((counts.attention / total) * 100),
    critical: Math.round((counts.critical / total) * 100),
    unknown: Math.round((counts.unknown / total) * 100)
  }
}

function updateSignal(pendingUpdateCount: number | null): OperationalSignalStatus {
  if (pendingUpdateCount === null) return 'unknown'
  return pendingUpdateCount > 0 ? 'attention' : 'healthy'
}

export class DashboardService {
  constructor(
    private readonly siteService = new SiteService(),
    private readonly healthService = new HealthService(),
    private readonly auditService = new AuditService(),
    private readonly scheduledTaskService = new ScheduledTaskService()
  ) {}

  getOverview(page = 1, pageSize = 5, search = '', now = new Date()): DashboardOverview {
    const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1
    const safePageSize = Number.isFinite(pageSize) ? Math.min(25, Math.max(1, Math.floor(pageSize))) : 5
    const query = search.trim().toLowerCase()
    const sites = this.siteService.list().filter(site => site.status === 'active')
    const summaries = new Map(this.healthService.listSummaries(now).map(summary => [summary.siteId, summary]))
    const overviewSites = sites.map((site): ManagedSiteOverview => {
      const health = summaries.get(site.id)
      const pendingUpdateCount = health?.latest
        ? health.latest.pluginUpdateCount + health.latest.themeUpdateCount
        : null

      return {
        id: site.id,
        name: site.name,
        url: site.url,
        status: health?.status ?? 'unknown',
        statusReason: health?.reason ?? 'No health data available',
        uptimeStatus: 'unknown',
        updateStatus: updateSignal(pendingUpdateCount),
        pendingUpdateCount,
        securityStatus: 'unknown',
        backupStatus: 'unknown',
        sslStatus: 'unknown',
        lastCheckInAt: health?.latest?.createdAt ?? null
      }
    })
    const filteredOverviewSites = overviewSites.filter(site =>
      !query || site.name.toLowerCase().includes(query) || site.url.toLowerCase().includes(query)
    )
    const counts = overviewSites.reduce<Record<HealthStatus, number>>((result, site) => {
      result[site.status] += 1
      return result
    }, { healthy: 0, attention: 0, critical: 0, unknown: 0 })
    const totalPages = Math.max(1, Math.ceil(filteredOverviewSites.length / safePageSize))
    const normalizedPage = Math.min(safePage, totalPages)
    const offset = (normalizedPage - 1) * safePageSize
    const siteNames = new Map(sites.map(site => [site.id, site.name]))

    return {
      aggregates: {
        totalManagedSites: overviewSites.length,
        healthySites: counts.healthy,
        attentionSites: counts.attention,
        criticalIssues: counts.critical,
        unknownSites: counts.unknown,
        healthDistribution: distribution(counts, overviewSites.length)
      },
      sites: {
        items: filteredOverviewSites.slice(offset, offset + safePageSize),
        page: normalizedPage,
        pageSize: safePageSize,
        totalItems: filteredOverviewSites.length,
        totalPages
      },
      recentActivity: this.auditService.list(8).map(event => ({
        id: event.id,
        siteId: event.siteId,
        siteName: event.siteId ? siteNames.get(event.siteId) ?? null : null,
        eventType: event.eventType,
        label: activityLabels[event.eventType] ?? event.eventType.split('.').join(' '),
        createdAt: event.createdAt
      })),
      scheduledTasks: this.scheduledTaskService.list(now)
    }
  }
}
