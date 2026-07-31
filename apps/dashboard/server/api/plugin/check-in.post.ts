import { PluginReportingService } from '../../services/plugin-reporting-service'
import { handleApiError } from '../../utils/api'
import { getBackupService } from '../../utils/backups'
import { authenticatePluginRequest, parsePluginBody } from '../../utils/plugin-api'
import { CredentialService } from '../../services/credential-service'
import { getRuntimeSettings } from '../../utils/config'

export default defineEventHandler(async (event) => {
  try {
    const request = await authenticatePluginRequest(event)
    const settings = getRuntimeSettings(event)
    return await new PluginReportingService(
      undefined,
      getBackupService(event),
      undefined,
      undefined,
      new CredentialService(settings.credentialEncryptionKey)
    ).recordCheckIn(
      request.siteId,
      request.requestTimestamp,
      parsePluginBody(request.rawBody)
    )
  } catch (error) {
    return handleApiError(error)
  }
})
