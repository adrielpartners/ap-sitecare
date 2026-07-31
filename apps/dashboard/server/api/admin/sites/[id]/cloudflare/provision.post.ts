import { requireDashboardPermission } from '../../../../../utils/auth'
import { useCloudflareService } from '../../../../../utils/cloudflare-services'

export default defineEventHandler(async (event) => {
  const identity = requireDashboardPermission(event, 'identity:manage')
  const siteId = getRouterParam(event, 'id')
  if (!siteId) throw createError({ statusCode: 400, statusMessage: 'Site ID is required.' })
  return { data: await useCloudflareService(event).provisionUptime(siteId, identity.email) }
})
