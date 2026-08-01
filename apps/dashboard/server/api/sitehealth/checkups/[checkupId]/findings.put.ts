import type { SiteHealthArea, SiteHealthFindingSeverity } from '../../../../domain/sitehealth'
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
    return { ok: true, data: await service.saveFinding(checkupId, {
      id: typeof body.id === 'string' ? body.id : undefined,
      title: requireBodyString(body, 'title'),
      description: requireBodyString(body, 'description'),
      area: requireBodyString(body, 'area') as SiteHealthArea,
      severity: requireBodyString(body, 'severity') as SiteHealthFindingSeverity,
      status: body.status === 'dismissed' ? 'dismissed' : 'active',
      technicianNotes: typeof body.technicianNotes === 'string' ? body.technicianNotes : null
    }, getDashboardActor(event)) }
  } catch (error) {
    handleApiError(error)
  }
})
