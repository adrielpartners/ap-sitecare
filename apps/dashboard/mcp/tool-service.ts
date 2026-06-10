import type Database from 'better-sqlite3'
import { ActionRequestRepository } from '../server/repositories/action-request-repository'
import { AuditRepository } from '../server/repositories/audit-repository'
import { CheckInRepository } from '../server/repositories/check-in-repository'
import { SiteRepository } from '../server/repositories/site-repository'
import { ActionRequestService } from '../server/services/action-request-service'
import { AuditService } from '../server/services/audit-service'
import { HealthService } from '../server/services/health-service'
import { SiteService } from '../server/services/site-service'

export class McpToolService {
  private readonly sites: SiteService
  private readonly health: HealthService
  private readonly actions: ActionRequestService

  constructor(database: Database.Database) {
    const siteRepository = new SiteRepository(database)
    const audit = new AuditService(new AuditRepository(database))
    this.sites = new SiteService(siteRepository, audit)
    this.health = new HealthService(new CheckInRepository(database), siteRepository, audit)
    this.actions = new ActionRequestService(new ActionRequestRepository(database), this.sites, audit)
  }

  listSites() {
    const summaries = new Map(this.health.listSummaries().map(summary => [summary.siteId, summary]))
    return this.sites.list().map(site => ({ site, health: summaries.get(site.id) }))
  }

  getSiteHealth(siteId: string) {
    return this.health.getSummary(siteId)
  }

  getBackupStatus(siteId: string) {
    const site = this.sites.get(siteId)
    return {
      siteId,
      strategy: site.backupStrategy,
      status: site.backupStrategy ? 'documented' : 'unknown',
      note: 'External backup providers remain the source of truth.'
    }
  }

  getSiteNotes(siteId: string) {
    const site = this.sites.get(siteId)
    return { siteId, notes: site.notes, riskLevel: site.riskLevel, hostingProvider: site.hostingProvider }
  }

  createActionRequest(siteId: string, actionType: string, rationale: string, requestedBy = 'mcp-agent') {
    return this.actions.create(siteId, actionType, rationale, requestedBy)
  }
}
