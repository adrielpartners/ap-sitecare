import { AutomationService } from '../../../../services/automation-service'
import { requireAccessIdentity } from '../../../../utils/auth'
import { handleApiError } from '../../../../utils/api'

export default defineEventHandler(async (event) => {
  try {
    const identity = requireAccessIdentity(event)
    const bucket = Math.floor(Date.now() / 60_000)
    const result = await new AutomationService().enqueue({
      siteId: null,
      jobType: 'hostinger.portfolio.synchronize',
      operationKey: 'hostinger-portfolio',
      idempotencyKey: `manual:hostinger-portfolio:${identity.userId}:${bucket}`,
      requestedByType: 'dashboard-user',
      requestedBy: identity.userId,
      maxAttempts: 3
    })
    return { ok: true, data: result }
  } catch (error) {
    handleApiError(error)
  }
})
