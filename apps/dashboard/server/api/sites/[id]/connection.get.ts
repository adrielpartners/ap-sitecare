import { CredentialService } from '../../../services/credential-service'
import { SiteRegistrationService } from '../../../services/site-registration-service'
import { handleApiError } from '../../../utils/api'
import { getRuntimeSettings } from '../../../utils/config'

export default defineEventHandler((event) => {
  try {
    const siteId = getRouterParam(event, 'id')
    if (!siteId) throw createError({ statusCode: 400, statusMessage: 'Site ID is required.' })
    const config = getRuntimeSettings(event)
    const service = new SiteRegistrationService(
      undefined,
      undefined,
      new CredentialService(config.credentialEncryptionKey)
    )
    return { ok: true, data: service.testConnection(siteId) }
  } catch (error) {
    handleApiError(error)
  }
})
