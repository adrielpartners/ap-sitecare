import { HealthService } from '../../../services/health-service'
import { handleApiError } from '../../../utils/api'

export default defineEventHandler((event) => {
  try {
    return { data: new HealthService().getSummary(getRouterParam(event, 'id') ?? '') }
  } catch (error) {
    return handleApiError(error)
  }
})
