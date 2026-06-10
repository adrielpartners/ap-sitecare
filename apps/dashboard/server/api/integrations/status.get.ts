import { getIntegrationService } from '../../utils/integrations'

export default defineEventHandler((event) => {
  return { data: getIntegrationService(event).configuration() }
})
