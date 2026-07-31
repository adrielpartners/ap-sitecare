import { ClientRegistryService } from '../../../services/client-registry-service'
import { getDashboardActor, handleApiError, requireBodyString } from '../../../utils/api'

export default defineEventHandler(async (event) => {
  try {
    const clientAccountId = getRouterParam(event, 'id')
    if (!clientAccountId) throw createError({ statusCode: 400, statusMessage: 'Client account ID is required.' })
    const body = await readBody<Record<string, unknown>>(event)
    return {
      ok: true,
      data: await new ClientRegistryService().renameClient(
        clientAccountId,
        requireBodyString(body, 'name'),
        getDashboardActor(event)
      )
    }
  } catch (error) {
    handleApiError(error)
  }
})
