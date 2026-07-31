import { AutomationService } from '../../../../../services/automation-service'
import { getDashboardActor, handleApiError } from '../../../../../utils/api'

export default defineEventHandler(async (event) => {
  try {
    const jobId = getRouterParam(event, 'id')
    if (!jobId) throw createError({ statusCode: 400, statusMessage: 'Automation job ID is required.' })
    const body = await readBody<Record<string, unknown>>(event)
    const additionalAttempts = body.additionalAttempts === undefined ? 3 : Number(body.additionalAttempts)
    return {
      ok: true,
      data: await new AutomationService().retry(jobId, getDashboardActor(event), additionalAttempts)
    }
  } catch (error) {
    handleApiError(error)
  }
})
