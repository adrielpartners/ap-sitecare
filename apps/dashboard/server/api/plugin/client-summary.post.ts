import { PluginClientSummaryService } from '../../services/plugin-client-summary-service'
import { handleApiError } from '../../utils/api'
import { authenticatePluginRequest } from '../../utils/plugin-api'

export default defineEventHandler(async (event) => {
  try {
    const request = await authenticatePluginRequest(event)
    return {
      data: new PluginClientSummaryService().get(request.siteId)
    }
  } catch (error) {
    return handleApiError(error)
  }
})
