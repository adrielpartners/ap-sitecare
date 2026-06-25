import { PluginReportingService } from '../../services/plugin-reporting-service'
import { handleApiError } from '../../utils/api'
import { getBackupService } from '../../utils/backups'
import { authenticatePluginRequest, parsePluginBody } from '../../utils/plugin-api'

export default defineEventHandler(async (event) => {
  try {
    const request = await authenticatePluginRequest(event)
    return new PluginReportingService(undefined, getBackupService(event)).recordCheckIn(
      request.siteId,
      request.requestTimestamp,
      parsePluginBody(request.rawBody)
    )
  } catch (error) {
    return handleApiError(error)
  }
})
