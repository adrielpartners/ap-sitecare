import type { HostingerSiteConnection, Site } from '../domain/types'
import { HostingerApiError, HostingerClient } from '../integrations/hostinger-client'
import { HostingerRepository } from '../repositories/hostinger-repository'
import { AuditService } from './audit-service'
import { SiteService } from './site-service'

const HOSTINGER_MANAGEMENT_URL = 'https://hpanel.hostinger.com/websites'
const DAILY_BACKUP_MESSAGE = 'Not available from the Hostinger shared-hosting API. Routine backups remain managed in hPanel.'

export class HostingerPortfolioService {
  constructor(
    private readonly client: HostingerClient,
    private readonly repository = new HostingerRepository(),
    private readonly siteService = new SiteService(),
    private readonly auditService = new AuditService()
  ) {}

  async synchronize(actorIdentifier = 'system:automation'): Promise<{
    checkedAt: string
    matched: number
    notFound: number
    availability: 'available' | 'not-configured' | 'provider-error'
  }> {
    const sites = (await this.siteService.list()).filter(site => site.status === 'active')
    const now = new Date().toISOString()
    try {
      const portfolio = await this.client.listPortfolio()
      if (portfolio.availability === 'not-configured') {
        await this.saveUnavailable(sites, 'not-configured', now, 'hostinger-not-configured', 'Hostinger API token is not configured.')
        return { checkedAt: now, matched: 0, notFound: sites.length, availability: 'not-configured' }
      }
      let matched = 0
      let notFound = 0
      for (const site of sites) {
        const domain = normalizeDomain(new URL(site.url).hostname)
        const website = portfolio.websites.find(entry => normalizeDomain(entry.domain) === domain)
        const installation = portfolio.installations.find(entry =>
          normalizeDomain(entry.domain) === domain || domainFromOptionalUrl(entry.url) === domain
        )
        const available = Boolean(website || installation)
        if (available) matched += 1
        else notFound += 1
        const existing = await this.repository.findBySiteId(site.id)
        await this.repository.save({
          siteId: site.id,
          availability: available ? 'available' : 'not-found',
          domain,
          accountUsername: installation?.username ?? website?.username ?? null,
          websiteOrderId: website?.orderId ?? null,
          wordpressInstallationId: installation?.id ?? null,
          websiteEnabled: website?.enabled ?? null,
          wordpressValid: installation?.valid ?? null,
          rootDirectory: website?.rootDirectory ?? null,
          managementUrl: HOSTINGER_MANAGEMENT_URL,
          dailyBackupAvailability: 'not-available',
          latestDailyBackupAt: null,
          dailyBackupMessage: DAILY_BACKUP_MESSAGE,
          metadata: {
            websiteCreatedAt: website?.createdAt ?? null,
            wordpressCreatedAt: installation?.createdAt ?? null,
            wordpressValidationError: installation?.validationError ?? null,
            matchSource: installation ? 'wordpress-installation-domain' : website ? 'website-domain' : 'none',
            wordpressInstallationsAvailability: portfolio.wordpressInstallationsAvailability,
            providerWarnings: portfolio.warnings
          },
          lastSyncedAt: portfolio.checkedAt,
          lastErrorCode: null,
          lastErrorMessage: null,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now
        })
      }
      await this.auditService.record({
        siteId: null,
        actorType: actorIdentifier.startsWith('system:') ? 'automation-worker' : 'dashboard-user',
        actorIdentifier,
        eventType: 'hostinger.portfolio-synchronized',
        metadata: { matched, notFound, websiteCount: portfolio.websites.length, installationCount: portfolio.installations.length }
      })
      return { checkedAt: portfolio.checkedAt, matched, notFound, availability: 'available' }
    } catch (error) {
      const code = error instanceof HostingerApiError ? error.code : 'hostinger-request-failed'
      const message = error instanceof Error ? error.message : 'Hostinger synchronization failed.'
      await this.saveUnavailable(sites, 'provider-error', now, code, message)
      return { checkedAt: now, matched: 0, notFound: sites.length, availability: 'provider-error' }
    }
  }

  async getSite(siteId: string): Promise<HostingerSiteConnection> {
    const site = await this.siteService.get(siteId)
    const existing = await this.repository.findBySiteId(siteId)
    if (existing) return existing
    const now = new Date().toISOString()
    return {
      siteId,
      availability: 'not-synchronized',
      domain: normalizeDomain(new URL(site.url).hostname),
      accountUsername: null,
      websiteOrderId: null,
      wordpressInstallationId: null,
      websiteEnabled: null,
      wordpressValid: null,
      rootDirectory: null,
      managementUrl: HOSTINGER_MANAGEMENT_URL,
      dailyBackupAvailability: 'not-available',
      latestDailyBackupAt: null,
      dailyBackupMessage: DAILY_BACKUP_MESSAGE,
      metadata: {},
      lastSyncedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: now,
      updatedAt: now
    }
  }

  private async saveUnavailable(
    sites: Site[],
    availability: 'not-configured' | 'provider-error',
    now: string,
    errorCode: string,
    errorMessage: string
  ): Promise<void> {
    for (const site of sites) {
      const existing = await this.repository.findBySiteId(site.id)
      await this.repository.save({
        ...(existing ?? await this.getSite(site.id)),
        availability,
        lastSyncedAt: now,
        lastErrorCode: errorCode,
        lastErrorMessage: errorMessage,
        updatedAt: now
      })
    }
  }
}

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '')
}

function domainFromOptionalUrl(value: string | null): string | null {
  if (!value) return null
  try {
    return normalizeDomain(new URL(value).hostname)
  } catch {
    return null
  }
}
