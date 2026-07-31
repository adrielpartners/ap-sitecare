import { AutomationService } from '../../../../services/automation-service'
import { handleApiError } from '../../../../utils/api'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const limit = typeof query.limit === 'string' ? Number.parseInt(query.limit, 10) : undefined
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 500)) {
      throw createError({ statusCode: 400, statusMessage: 'Limit must be a whole number from 1 to 500.' })
    }
    return {
      ok: true,
      data: await new AutomationService().list({
        siteId: typeof query.siteId === 'string' ? query.siteId : undefined,
        status: typeof query.status === 'string' ? query.status : undefined,
        limit
      })
    }
  } catch (error) {
    handleApiError(error)
  }
})
