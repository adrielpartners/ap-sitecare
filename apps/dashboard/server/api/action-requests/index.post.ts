import { ActionRequestService } from '../../services/action-request-service'
import { getDashboardActor, handleApiError, requireBodyString } from '../../utils/api'
import { requireDashboardSiteAccess } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, unknown>>(event)
    const siteId = requireBodyString(body, 'siteId')
    requireDashboardSiteAccess(event, siteId)
    const request = await new ActionRequestService().create(
      siteId,
      requireBodyString(body, 'actionType'),
      requireBodyString(body, 'rationale'),
      getDashboardActor(event)
    )
    setResponseStatus(event, 201)
    return { data: request }
  } catch (error) {
    return handleApiError(error)
  }
})
