import { CredentialService } from '../../../../services/credential-service'
import { requireAccessIdentity } from '../../../../utils/auth'
import { handleApiError } from '../../../../utils/api'
import { getRuntimeSettings } from '../../../../utils/config'

export default defineEventHandler(async (event) => {
  try {
    const siteId = getRouterParam(event, 'id')
    if (!siteId) throw createError({ statusCode: 400, statusMessage: 'Site ID is required.' })
    const identity = requireAccessIdentity(event)
    await new CredentialService(getRuntimeSettings(event).credentialEncryptionKey).revokeAll(siteId, identity.userId)
    return { ok: true, data: { revoked: true } }
  } catch (error) {
    handleApiError(error)
  }
})
