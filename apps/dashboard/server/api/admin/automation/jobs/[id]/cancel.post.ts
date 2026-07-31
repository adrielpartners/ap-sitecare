import { AutomationService } from '../../../../../services/automation-service'
import { getDashboardActor, handleApiError } from '../../../../../utils/api'

export default defineEventHandler(async (event) => {
  try {
    const jobId = getRouterParam(event, 'id')
    if (!jobId) throw createError({ statusCode: 400, statusMessage: 'Automation job ID is required.' })
    return { ok: true, data: await new AutomationService().cancel(jobId, getDashboardActor(event)) }
  } catch (error) {
    handleApiError(error)
  }
})
