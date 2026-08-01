import { SiteHealthService } from '../../../../services/sitehealth-service'
import { getDashboardActor, handleApiError } from '../../../../utils/api'
import { requireDashboardPermission, requireDashboardSiteAccess } from '../../../../utils/auth'

export default defineEventHandler(async (event) => {
  try {
    const checkupId = getRouterParam(event, 'checkupId')
    if (!checkupId) throw createError({ statusCode: 400, statusMessage: 'Checkup ID is required.' })
    requireDashboardPermission(event, 'operations:write')
    const service = new SiteHealthService()
    const detail = await service.getCheckup(checkupId)
    requireDashboardSiteAccess(event, detail.checkup.siteId)
    return { ok: true, data: await service.publish(checkupId, getDashboardActor(event)) }
  } catch (error) {
    handleApiError(error)
  }
})
