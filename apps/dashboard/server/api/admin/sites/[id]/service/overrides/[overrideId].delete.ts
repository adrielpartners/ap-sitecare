import { EntitlementService } from '../../../../../../services/entitlement-service'
import { getDashboardActor, handleApiError, requireBodyString } from '../../../../../../utils/api'

export default defineEventHandler(async (event) => {
  try {
    const siteId = getRouterParam(event, 'id')
    const overrideId = getRouterParam(event, 'overrideId')
    if (!siteId || !overrideId) throw createError({ statusCode: 400, statusMessage: 'Site and override IDs are required.' })
    const body = await readBody<Record<string, unknown>>(event)
    return {
      ok: true,
      data: await new EntitlementService().removeOverride(
        siteId,
        overrideId,
        requireBodyString(body, 'reason'),
        getDashboardActor(event)
      )
    }
  } catch (error) {
    handleApiError(error)
  }
})
