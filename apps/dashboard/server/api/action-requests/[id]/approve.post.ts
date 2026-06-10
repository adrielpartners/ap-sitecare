import { ActionRequestService } from '../../../services/action-request-service'
import { getDashboardActor, handleApiError } from '../../../utils/api'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, unknown>>(event)
    return {
      data: new ActionRequestService().review(
        getRouterParam(event, 'id') ?? '',
        'approved',
        getDashboardActor(event),
        typeof body.note === 'string' ? body.note : undefined
      )
    }
  } catch (error) {
    return handleApiError(error)
  }
})
