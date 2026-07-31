import { requireDashboardSiteAccess } from '../../../../../utils/auth'
import { useCloudflareService } from '../../../../../utils/cloudflare-services'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'id')
  if (!siteId) throw createError({ statusCode: 400, statusMessage: 'Site ID is required.' })
  const identity = requireDashboardSiteAccess(event, siteId)
  const body = await readBody<{ startsAt?: string, endsAt?: string, reason?: string }>(event)
  return {
    data: await useCloudflareService(event).createMaintenanceWindow(siteId, {
      startsAt: body.startsAt ?? '', endsAt: body.endsAt ?? '', reason: body.reason ?? ''
    }, identity.email)
  }
})
