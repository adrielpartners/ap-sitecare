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
    const body = await readBody<Record<string, unknown>>(event)
    return { ok: true, data: await service.updateDraft(checkupId, {
      title: typeof body.title === 'string' ? body.title : undefined,
      executiveSummary: typeof body.executiveSummary === 'string' ? body.executiveSummary : undefined
    }, getDashboardActor(event)) }
  } catch (error) {
    handleApiError(error)
  }
})
