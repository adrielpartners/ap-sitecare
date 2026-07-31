import { ClientRegistryService } from '../../../services/client-registry-service'
import { handleApiError } from '../../../utils/api'

export default defineEventHandler(async (event) => {
  try {
    const clientAccountId = getRouterParam(event, 'id')
    if (!clientAccountId) throw createError({ statusCode: 400, statusMessage: 'Client account ID is required.' })
    return { ok: true, data: await new ClientRegistryService().getClient(clientAccountId) }
  } catch (error) {
    handleApiError(error)
  }
})
