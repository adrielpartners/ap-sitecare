import { SiteHealthService } from '../../../../services/sitehealth-service'
import { handleApiError } from '../../../../utils/api'
import { requireDashboardPermission, requireDashboardSiteAccess } from '../../../../utils/auth'

export default defineEventHandler(async (event) => {
  try {
    const checkupId = getRouterParam(event, 'checkupId')
    if (!checkupId) throw createError({ statusCode: 400, statusMessage: 'Checkup ID is required.' })
    requireDashboardPermission(event, 'operations:read')
    const data = await new SiteHealthService().getCheckup(checkupId)
    requireDashboardSiteAccess(event, data.checkup.siteId)
    return { ok: true, data }
  } catch (error) {
    handleApiError(error)
  }
})
