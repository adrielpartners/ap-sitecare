import { getIntegrationService } from '../../utils/integrations'

export default defineEventHandler(async (event) => {
  return { data: await getIntegrationService(event).configuration() }
})
