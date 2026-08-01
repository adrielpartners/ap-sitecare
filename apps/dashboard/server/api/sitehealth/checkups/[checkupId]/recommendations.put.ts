import type { SiteHealthArea, SiteHealthCleanupActionType } from '../../../../domain/sitehealth'
import { SiteHealthService } from '../../../../services/sitehealth-service'
import { getDashboardActor, handleApiError, requireBodyString } from '../../../../utils/api'
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
    return { ok: true, data: await service.saveRecommendation(checkupId, {
      id: typeof body.id === 'string' ? body.id : undefined,
      title: requireBodyString(body, 'title'),
      description: requireBodyString(body, 'description'),
      area: requireBodyString(body, 'area') as SiteHealthArea,
      actionType: requireBodyString(body, 'actionType') as SiteHealthCleanupActionType,
      priority: requireBodyString(body, 'priority') as 'low' | 'medium' | 'high',
      status: body.status === 'dismissed' ? 'dismissed' : 'proposed'
    }, getDashboardActor(event)) }
  } catch (error) {
    handleApiError(error)
  }
})
