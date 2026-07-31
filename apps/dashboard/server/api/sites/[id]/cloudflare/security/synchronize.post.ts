import { requireDashboardSiteAccess } from '../../../../../utils/auth'
import { useCloudflareService } from '../../../../../utils/cloudflare-services'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'id')
  if (!siteId) throw createError({ statusCode: 400, statusMessage: 'Site ID is required.' })
  const identity = requireDashboardSiteAccess(event, siteId)
  return { data: await useCloudflareService(event).synchronizeSecurity(siteId, identity.email) }
})
