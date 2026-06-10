import { CredentialService } from '../../../services/credential-service'
import { handleApiError } from '../../../utils/api'
import { getRuntimeSettings } from '../../../utils/config'

export default defineEventHandler((event) => {
  try {
    const siteId = getRouterParam(event, 'id')
    if (!siteId) throw createError({ statusCode: 400, statusMessage: 'Site ID is required.' })
    const config = getRuntimeSettings(event)
    return { ok: true, data: new CredentialService(config.credentialEncryptionKey).issue(siteId) }
  } catch (error) {
    handleApiError(error)
  }
})
