import { SiteHealthService } from '../../../../services/sitehealth-service'
import { getDashboardActor, handleApiError } from '../../../../utils/api'
import { requireDashboardPermission, requireDashboardSiteAccess } from '../../../../utils/auth'

export default defineEventHandler(async (event) => {
  try {
    const siteId = getRouterParam(event, 'id')
    if (!siteId) throw createError({ statusCode: 400, statusMessage: 'Site ID is required.' })
    requireDashboardPermission(event, 'operations:write')
    requireDashboardSiteAccess(event, siteId)
    const body = await readBody<Record<string, unknown>>(event)
    return {
      ok: true,
      data: await new SiteHealthService().requestManualCheckup(
        siteId,
        getDashboardActor(event),
        body.includeBrokenLinks === true
      )
    }
  } catch (error) {
    handleApiError(error)
  }
})
