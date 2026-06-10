import { HealthService } from '../../../services/health-service'
import { SiteService } from '../../../services/site-service'

export default defineEventHandler(() => {
  const health = new Map(new HealthService().listSummaries().map(summary => [summary.siteId, summary]))
  return { data: new SiteService().list().map(site => ({ site, health: health.get(site.id) })) }
})
