import { ClientRegistryService } from '../../../../services/client-registry-service'
import { requireAccessIdentity } from '../../../../utils/auth'
import { handleApiError } from '../../../../utils/api'

export default defineEventHandler(async (event) => {
  try {
    const identity = requireAccessIdentity(event)
    const body = await readBody<Record<string, unknown>>(event)
    if (typeof body.siteId !== 'string') throw createError({ statusCode: 400, statusMessage: 'Site ID is required.' })
    await new ClientRegistryService().assignSite(
      getRouterParam(event, 'id') ?? '',
      body.siteId,
      identity.email
    )
    return { ok: true }
  } catch (error) {
    handleApiError(error)
  }
})
