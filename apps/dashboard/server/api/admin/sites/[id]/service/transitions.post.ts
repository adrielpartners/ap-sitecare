import { EntitlementService } from '../../../../../services/entitlement-service'
import { isServicePlanId, type ServicePlanId } from '../../../../../domain/service-plans'
import { getDashboardActor, handleApiError, optionalBodyString, requireBodyString } from '../../../../../utils/api'

export default defineEventHandler(async (event) => {
  try {
    const siteId = getRouterParam(event, 'id')
    if (!siteId) throw createError({ statusCode: 400, statusMessage: 'Site ID is required.' })
    const body = await readBody<Record<string, unknown>>(event)
    const action = requireBodyString(body, 'action')
    if (!['change-plan', 'cancel-service', 'cancel-pending-change'].includes(action)) {
      throw createError({ statusCode: 400, statusMessage: 'Unsupported plan action.' })
    }
    const requestedTargetPlanId = optionalBodyString(body, 'targetPlanId')
    let targetPlanId: ServicePlanId | undefined
    if (requestedTargetPlanId !== null) {
      if (!isServicePlanId(requestedTargetPlanId)) {
        throw createError({ statusCode: 400, statusMessage: 'A valid target plan is required.' })
      }
      targetPlanId = requestedTargetPlanId
    }
    return {
      ok: true,
      data: await new EntitlementService().applyChange(siteId, {
        action: action as 'change-plan' | 'cancel-service' | 'cancel-pending-change',
        targetPlanId,
        effectiveAt: optionalBodyString(body, 'effectiveAt') ?? undefined,
        paidThroughAt: optionalBodyString(body, 'paidThroughAt'),
        reason: requireBodyString(body, 'reason'),
        actorIdentifier: getDashboardActor(event)
      })
    }
  } catch (error) {
    handleApiError(error)
  }
})
