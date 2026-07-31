import { ClientRegistryService } from '../../../../services/client-registry-service'
import { getDashboardActor, handleApiError, requireBodyString } from '../../../../utils/api'

export default defineEventHandler(async (event) => {
  try {
    const clientAccountId = getRouterParam(event, 'id')
    if (!clientAccountId) throw createError({ statusCode: 400, statusMessage: 'Client account ID is required.' })
    const body = await readBody<Record<string, unknown>>(event)
    const status = requireBodyString(body, 'status')
    if (status !== 'active' && status !== 'suspended') {
      throw createError({ statusCode: 400, statusMessage: 'Client status must be active or suspended.' })
    }
    await new ClientRegistryService().changeClientStatus(
      clientAccountId,
      status,
      requireBodyString(body, 'reason'),
      getDashboardActor(event)
    )
    return { ok: true }
  } catch (error) {
    handleApiError(error)
  }
})
