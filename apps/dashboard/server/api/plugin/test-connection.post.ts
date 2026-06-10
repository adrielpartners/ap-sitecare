import { PluginReportingService } from '../../services/plugin-reporting-service'
import { handleApiError } from '../../utils/api'
import { authenticatePluginRequest } from '../../utils/plugin-api'

export default defineEventHandler(async (event) => {
  try {
    const request = await authenticatePluginRequest(event)
    return new PluginReportingService().testConnection(request.siteId)
  } catch (error) {
    return handleApiError(error)
  }
})
