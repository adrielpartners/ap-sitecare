import { requireDashboardSiteAccess } from '../../../../../utils/auth'
import { useCloudflareService } from '../../../../../utils/cloudflare-services'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'id')
  const windowId = getRouterParam(event, 'windowId')
  if (!siteId || !windowId) throw createError({ statusCode: 400, statusMessage: 'Site and maintenance window are required.' })
  const identity = requireDashboardSiteAccess(event, siteId)
  await useCloudflareService(event).cancelMaintenanceWindow(siteId, windowId, identity.email)
  return { data: { cancelled: true } }
})
