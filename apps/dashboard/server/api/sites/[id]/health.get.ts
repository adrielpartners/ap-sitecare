import { HealthService } from '../../../services/health-service'
import { handleApiError } from '../../../utils/api'

export default defineEventHandler(async (event) => {
  try {
    return { data: await new HealthService().getSummary(getRouterParam(event, 'id') ?? '') }
  } catch (error) {
    return handleApiError(error)
  }
})
