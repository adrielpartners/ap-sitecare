import { ActionRequestService } from '../../../services/action-request-service'
import { getDashboardActor, handleApiError } from '../../../utils/api'
import { requireAccessIdentity } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, unknown>>(event)
    return {
      data: await new ActionRequestService().review(
        getRouterParam(event, 'id') ?? '',
        'approved',
        getDashboardActor(event),
        typeof body.note === 'string' ? body.note : undefined,
        requireAccessIdentity(event).accessibleSiteIds
      )
    }
  } catch (error) {
    return handleApiError(error)
  }
})
