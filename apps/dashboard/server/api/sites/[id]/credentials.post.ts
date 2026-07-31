import { CredentialService } from '../../../services/credential-service'
import { handleApiError } from '../../../utils/api'
import { getRuntimeSettings } from '../../../utils/config'
import { requireAccessIdentity } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  try {
    const siteId = getRouterParam(event, 'id')
    if (!siteId) throw createError({ statusCode: 400, statusMessage: 'Site ID is required.' })
    const config = getRuntimeSettings(event)
    const identity = requireAccessIdentity(event)
    return { ok: true, data: await new CredentialService(config.credentialEncryptionKey).issue(siteId, identity.userId) }
  } catch (error) {
    handleApiError(error)
  }
})
