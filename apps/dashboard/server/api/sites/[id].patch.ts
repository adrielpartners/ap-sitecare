import { SiteService } from '../../services/site-service'
import type { RiskLevel } from '../../domain/types'
import { getDashboardActor, handleApiError, optionalBodyString } from '../../utils/api'

export default defineEventHandler(async (event) => {
  try {
    const siteId = getRouterParam(event, 'id')
    if (!siteId) throw createError({ statusCode: 400, statusMessage: 'Site ID is required.' })
    const body = await readBody<Record<string, unknown>>(event)
    const site = new SiteService().update(siteId, {
      name: typeof body.name === 'string' ? body.name : undefined,
      url: typeof body.url === 'string' ? body.url : undefined,
      hostingProvider: optionalBodyString(body, 'hostingProvider'),
      backupStrategy: optionalBodyString(body, 'backupStrategy'),
      riskLevel: optionalBodyString(body, 'riskLevel') as RiskLevel | undefined,
      notes: optionalBodyString(body, 'notes')
    }, getDashboardActor(event))
    return { ok: true, data: site }
  } catch (error) {
    handleApiError(error)
  }
})
