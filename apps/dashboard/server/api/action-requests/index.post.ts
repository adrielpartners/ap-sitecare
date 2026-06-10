import { ActionRequestService } from '../../services/action-request-service'
import { getDashboardActor, handleApiError, requireBodyString } from '../../utils/api'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, unknown>>(event)
    const request = new ActionRequestService().create(
      requireBodyString(body, 'siteId'),
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
