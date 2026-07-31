import { ClientRegistryService } from '../../services/client-registry-service'
import { isServicePlanId } from '../../domain/service-plans'
import type { RiskLevel } from '../../domain/types'
import { getDashboardActor, handleApiError, optionalBodyString, requireBodyString } from '../../utils/api'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, unknown>>(event)
    const planId = requireBodyString(body, 'planId')
    if (!isServicePlanId(planId)) throw createError({ statusCode: 400, statusMessage: 'A valid SiteCare plan is required.' })
    const site = await new ClientRegistryService().registerManagedSite({
      name: requireBodyString(body, 'name'),
      url: requireBodyString(body, 'url'),
      clientAccountId: requireBodyString(body, 'clientAccountId'),
      planId,
      hostingProvider: optionalBodyString(body, 'hostingProvider'),
      backupStrategy: optionalBodyString(body, 'backupStrategy'),
      riskLevel: optionalBodyString(body, 'riskLevel') as RiskLevel | undefined,
      notes: optionalBodyString(body, 'notes'),
      actorIdentifier: getDashboardActor(event)
    })
    setResponseStatus(event, 201)
    return { ok: true, data: site }
  } catch (error) {
    handleApiError(error)
  }
})
