import { CredentialService } from '../../../services/credential-service'
import { handleApiError } from '../../../utils/api'
import { getRuntimeSettings } from '../../../utils/config'

export default defineEventHandler(async (event) => {
  try {
    const siteId = getRouterParam(event, 'id')
    if (!siteId) throw createError({ statusCode: 400, statusMessage: 'Site ID is required.' })
    const config = getRuntimeSettings(event)
    const service = new CredentialService(config.credentialEncryptionKey)
    const summary = await service.getConnectionSummary(siteId)
    const status = summary.connection?.status
      ?? (summary.activeCredential ? 'awaiting-check-in' : 'revoked')
    return {
      ok: true,
      data: {
        status,
        message: status === 'connected'
          ? 'The WordPress connector is authenticated and reporting.'
          : status === 'awaiting-check-in'
            ? 'Credentials are ready. The WordPress connector has not reported yet.'
            : status === 'stale'
              ? 'The WordPress connector has not reported recently.'
              : 'The WordPress connection is revoked.',
        ...summary
      }
    }
  } catch (error) {
    handleApiError(error)
  }
})
