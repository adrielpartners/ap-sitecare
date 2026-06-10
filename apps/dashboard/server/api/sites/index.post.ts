import { SiteService } from '../../services/site-service'
import type { RiskLevel } from '../../domain/types'
import { getDashboardActor, handleApiError, optionalBodyString, requireBodyString } from '../../utils/api'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, unknown>>(event)
    const site = new SiteService().create({
      name: requireBodyString(body, 'name'),
      url: requireBodyString(body, 'url'),
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
