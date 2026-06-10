import type { IntegrationProvider } from '../../../../integrations/types'
import { handleApiError } from '../../../../utils/api'
import { getIntegrationService } from '../../../../utils/integrations'

export default defineEventHandler(async (event) => {
  try {
    const siteId = getRouterParam(event, 'id') ?? ''
    const provider = getRouterParam(event, 'provider') as IntegrationProvider
    return { data: await getIntegrationService(event).inspect(siteId, provider) }
  } catch (error) {
    return handleApiError(error)
  }
})
