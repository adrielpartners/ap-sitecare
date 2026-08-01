import { SiteHealthService } from '../../../../services/sitehealth-service'
import { requireDashboardPermission } from '../../../../utils/auth'

export default defineEventHandler(async (event) => {
  const identity = requireDashboardPermission(event, 'portal:read')
  return { ok: true, data: await new SiteHealthService().listClientPublishedReviews(identity.accessibleSiteIds) }
})
