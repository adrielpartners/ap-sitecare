import { HealthService } from '../services/health-service'
import { requireAccessIdentity } from '../utils/auth'

export default defineEventHandler(async (event) => {
  return { data: await new HealthService().listSummaries(new Date(), requireAccessIdentity(event).accessibleSiteIds) }
})
