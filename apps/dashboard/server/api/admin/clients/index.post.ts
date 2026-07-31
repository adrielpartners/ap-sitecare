import { ClientRegistryService } from '../../../services/client-registry-service'
import { getDashboardActor, handleApiError } from '../../../utils/api'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, unknown>>(event)
    if (typeof body.name !== 'string') throw createError({ statusCode: 400, statusMessage: 'Client name is required.' })
    setResponseStatus(event, 201)
    return { ok: true, data: await new ClientRegistryService().createClient(body.name, getDashboardActor(event)) }
  } catch (error) {
    handleApiError(error)
  }
})
