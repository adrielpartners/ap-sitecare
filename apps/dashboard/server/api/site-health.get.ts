import { HealthService } from '../services/health-service'

export default defineEventHandler(() => {
  return { data: new HealthService().listSummaries() }
})
