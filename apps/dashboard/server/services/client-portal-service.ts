import { BackupRepository } from '../repositories/backup-repository'
import { CloudflareRepository } from '../repositories/cloudflare-repository'
import { HostingerRepository } from '../repositories/hostinger-repository'
import { SiteRepository } from '../repositories/site-repository'
import { useDatabase, type QueryExecutor } from '../utils/database'
import { EntitlementService } from './entitlement-service'
import { NotificationService } from './notification-service'
import { SiteHealthService } from './sitehealth-service'
import { WordPressUpdateService } from './wordpress-update-service'
import { WordPressUpdateRepository } from '../repositories/wordpress-update-repository'
import { SiteService } from './site-service'
import { AuditRepository } from '../repositories/audit-repository'
import { AuditService } from './audit-service'

export class ClientPortalService {
  constructor(private readonly database: QueryExecutor = useDatabase()) {}

  async overview(siteIds: string[]) {
    if (!siteIds.length) return []
    const siteRepository = new SiteRepository(this.database)
    const sites = await siteRepository.listByIds(siteIds)
    const reviews = await new SiteHealthService(this.database).listClientPublishedReviews(siteIds)
    const audit = new AuditService(new AuditRepository(this.database))
    const result = []
    for (const site of sites) {
      const [entitlement, updates, hostinger, artifacts, monitor, incidents, security, recipients] = await Promise.all([
        new EntitlementService(this.database).get(site.id),
        new WordPressUpdateService(new WordPressUpdateRepository(this.database), new SiteService(siteRepository, audit), audit).getSiteDetail(site.id),
        new HostingerRepository(this.database).findBySiteId(site.id),
        new BackupRepository(this.database).listArtifacts(site.id),
        new CloudflareRepository(this.database).findMonitor(site.id),
        new CloudflareRepository(this.database).listIncidents(site.id, 20),
        new CloudflareRepository(this.database).listPortfolioStatus([site.id]),
        new NotificationService(this.database).listRecipients(site.id)
      ])
      const latestLongTerm = artifacts.find(artifact => artifact.status === 'completed') ?? null
      const latestFailed = artifacts.find(artifact => artifact.status === 'failed') ?? null
      const publishedReviews = reviews.filter(review => review.siteId === site.id)
      const uptimeIncluded = entitlement.capabilities['uptime-monitoring']
      result.push({
        id: site.id,
        name: site.name,
        url: site.url,
        status: site.status,
        service: {
          planId: entitlement.underlyingPlan.id,
          planName: entitlement.underlyingPlan.name,
          operationalStatus: entitlement.operationalStatus,
          includedServices: Object.entries(entitlement.capabilities)
            .filter(([, included]) => included)
            .map(([capability]) => capability)
        },
        updates: {
          availability: updates.snapshot ? 'available' : 'unavailable',
          checkedAt: updates.snapshot?.checkedAt ?? null,
          pendingCount: updates.snapshot?.pendingUpdateCount ?? null,
          stale: updates.stale,
          recentActivity: updates.activities.slice(0, 10).map(activity => ({
            id: activity.id, name: activity.name, priorVersion: activity.priorVersion,
            resultingVersion: activity.resultingVersion, outcome: activity.outcome,
            completedAt: activity.completedAt
          }))
        },
        backups: {
          hostinger: {
            included: true,
            retentionDays: entitlement.settings.hostingerBackupRetentionDays,
            availability: hostinger?.dailyBackupAvailability ?? 'not-available',
            latestSuccessfulAt: hostinger?.latestDailyBackupAt ?? null,
            message: hostinger?.dailyBackupMessage ?? 'Daily backups are managed by Hostinger; the latest timestamp is not currently available.'
          },
          sitecare: {
            included: entitlement.capabilities['long-term-backups'],
            latestSuccessfulAt: entitlement.capabilities['long-term-backups'] ? latestLongTerm?.completedAt ?? null : null,
            latestFailureAt: entitlement.capabilities['long-term-backups'] ? latestFailed?.completedAt ?? latestFailed?.startedAt ?? null : null,
            retentionMonths: entitlement.settings.longTermBackupRetentionMonths
          }
        },
        uptime: uptimeIncluded ? {
          included: true,
          status: monitor?.status ?? 'unknown',
          lastSuccessAt: monitor?.lastSuccessAt ?? null,
          recentIncidents: incidents.map(incident => ({
            id: incident.id, status: incident.status, startedAt: incident.startedAt,
            recoveredAt: incident.recoveredAt, durationSeconds: incident.durationSeconds,
            recoveryNotes: incident.recoveryNotes
          }))
        } : { included: false, status: 'not-included', lastSuccessAt: null, recentIncidents: [] },
        security: {
          activeControlCount: security[0]?.securityActive ?? 0,
          reviewControlCount: security[0]?.securityReview ?? 0,
          tlsHealthy: !(security[0]?.tlsAlertOpen ?? false)
        },
        reviews: publishedReviews.map(review => ({
          id: review.id, title: review.title, version: review.version,
          status: review.status, publishedAt: review.publishedAt
        })),
        notificationRecipients: recipients.map(recipient => ({
          id: recipient.id, email: recipient.email, displayName: recipient.displayName,
          enabled: recipient.enabled, categories: recipient.categories
        }))
      })
    }
    return result
  }
}
