import { AutomationService } from '../../../../services/automation-service'
import { requireAccessIdentity } from '../../../../utils/auth'
import { handleApiError } from '../../../../utils/api'

export default defineEventHandler(async (event) => {
  try {
    const siteId = getRouterParam(event, 'id')
    if (!siteId) throw createError({ statusCode: 400, statusMessage: 'Site ID is required.' })
    const identity = requireAccessIdentity(event)
    const bucket = Math.floor(Date.now() / 60_000)
    const result = await new AutomationService().enqueue({
      siteId,
      jobType: 'wordpress.refresh',
      operationKey: 'wordpress-update-refresh',
      idempotencyKey: `manual:wordpress-refresh:${siteId}:${identity.userId}:${bucket}`,
      requestedByType: 'dashboard-user',
      requestedBy: identity.userId,
      maxAttempts: 3
    })
    return { ok: true, data: result }
  } catch (error) {
    handleApiError(error)
  }
})
