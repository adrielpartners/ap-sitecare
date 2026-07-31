import { EntitlementService } from '../../../../../../services/entitlement-service'
import { isServiceCapability, type EntitlementOverrideType, type ServiceCapability } from '../../../../../../domain/service-plans'
import { getDashboardActor, handleApiError, optionalBodyString, requireBodyString } from '../../../../../../utils/api'

export default defineEventHandler(async (event) => {
  try {
    const siteId = getRouterParam(event, 'id')
    if (!siteId) throw createError({ statusCode: 400, statusMessage: 'Site ID is required.' })
    const body = await readBody<Record<string, unknown>>(event)
    const overrideType = requireBodyString(body, 'overrideType')
    if (!['service-exception', 'uptime-interval-minutes', 'uptime-alert-threshold', 'long-term-backup-frequency'].includes(overrideType)) {
      throw createError({ statusCode: 400, statusMessage: 'Unsupported entitlement override type.' })
    }
    const requestedCapability = optionalBodyString(body, 'capability')
    let capability: ServiceCapability | null = null
    if (requestedCapability !== null) {
      if (!isServiceCapability(requestedCapability)) {
        throw createError({ statusCode: 400, statusMessage: 'A valid service capability is required.' })
      }
      capability = requestedCapability
    }
    return {
      ok: true,
      data: await new EntitlementService().createOverride(siteId, {
        overrideType: overrideType as EntitlementOverrideType,
        capability,
        value: body.value,
        reason: requireBodyString(body, 'reason'),
        startsAt: optionalBodyString(body, 'startsAt') ?? undefined,
        expiresAt: optionalBodyString(body, 'expiresAt')
      }, getDashboardActor(event))
    }
  } catch (error) {
    handleApiError(error)
  }
})
