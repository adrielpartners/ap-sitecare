import { ActionRequestRepository } from '../server/repositories/action-request-repository'
import { AuditRepository } from '../server/repositories/audit-repository'
import { CheckInRepository } from '../server/repositories/check-in-repository'
import { SiteRepository } from '../server/repositories/site-repository'
import { ActionRequestService } from '../server/services/action-request-service'
import { AuditService } from '../server/services/audit-service'
import { HealthService } from '../server/services/health-service'
import { SiteService } from '../server/services/site-service'
import { EntitlementService } from '../server/services/entitlement-service'
import type { TransactionalQueryExecutor } from '../server/utils/database'

export class McpToolService {
  private readonly sites: SiteService
  private readonly health: HealthService
  private readonly actions: ActionRequestService
  private readonly entitlements: EntitlementService

  constructor(database: TransactionalQueryExecutor) {
    const siteRepository = new SiteRepository(database)
    const audit = new AuditService(new AuditRepository(database))
    this.sites = new SiteService(siteRepository, audit)
    this.health = new HealthService(new CheckInRepository(database), siteRepository, audit)
    this.actions = new ActionRequestService(new ActionRequestRepository(database), this.sites, audit)
    this.entitlements = new EntitlementService(database)
  }

  async listSites() {
    const [healthSummaries, sites] = await Promise.all([
      this.health.listSummaries(),
      this.sites.list()
    ])
    const summaries = new Map(healthSummaries.map(summary => [summary.siteId, summary]))
    return Promise.all(sites.map(async site => ({
      site,
      health: summaries.get(site.id),
      entitlements: await this.entitlements.get(site.id)
    })))
  }

  getSiteHealth(siteId: string) {
    return this.health.getSummary(siteId)
  }

  async getBackupStatus(siteId: string) {
    const site = await this.sites.get(siteId)
    const entitlements = await this.entitlements.get(siteId)
    return {
      siteId,
      strategy: site.backupStrategy,
      longTermBackupsEnabled: entitlements.capabilities['long-term-backups'],
      servicePlan: entitlements.underlyingPlan.name,
      serviceStatus: entitlements.operationalStatus,
      status: site.backupStrategy ? 'documented' : 'unknown',
      note: 'External backup providers remain the source of truth.'
    }
  }

  async getSiteNotes(siteId: string) {
    const site = await this.sites.get(siteId)
    return { siteId, notes: site.notes, riskLevel: site.riskLevel, hostingProvider: site.hostingProvider }
  }

  createActionRequest(siteId: string, actionType: string, rationale: string, requestedBy = 'mcp-agent') {
    return this.actions.create(siteId, actionType, rationale, requestedBy)
  }
}
