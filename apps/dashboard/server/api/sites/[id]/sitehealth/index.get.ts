import { SiteHealthService } from '../../../../services/sitehealth-service'
import { handleApiError } from '../../../../utils/api'
import { requireDashboardPermission, requireDashboardSiteAccess } from '../../../../utils/auth'

export default defineEventHandler(async (event) => {
  try {
    const siteId = getRouterParam(event, 'id')
    if (!siteId) throw createError({ statusCode: 400, statusMessage: 'Site ID is required.' })
    requireDashboardPermission(event, 'operations:read')
    requireDashboardSiteAccess(event, siteId)
    return { ok: true, data: await new SiteHealthService().getSiteOverview(siteId) }
  } catch (error) {
    handleApiError(error)
  }
})
