import { HealthService } from '../../../services/health-service'
import { SiteService } from '../../../services/site-service'
import { EntitlementService } from '../../../services/entitlement-service'
import { requireAccessIdentity } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const siteIds = requireAccessIdentity(event).accessibleSiteIds
  const [summaries, sites] = await Promise.all([
    new HealthService().listSummaries(new Date(), siteIds),
    new SiteService().list(siteIds)
  ])
  const health = new Map(summaries.map(summary => [summary.siteId, summary]))
  const entitlements = new EntitlementService()
  return {
    data: await Promise.all(sites.map(async site => ({
      site,
      health: health.get(site.id),
      entitlements: await entitlements.get(site.id)
    })))
  }
})
