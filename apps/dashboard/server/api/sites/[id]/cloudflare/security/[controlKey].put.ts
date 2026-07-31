import { requireDashboardSiteAccess } from '../../../../../utils/auth'
import { useCloudflareService } from '../../../../../utils/cloudflare-services'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'id')
  const controlKey = getRouterParam(event, 'controlKey')
  if (!siteId || !controlKey) throw createError({ statusCode: 400, statusMessage: 'Site and control are required.' })
  const identity = requireDashboardSiteAccess(event, siteId)
  const body = await readBody<{ status?: 'active' | 'inactive' | 'pending', notes?: string }>(event)
  if (!body.status || !['active', 'inactive', 'pending'].includes(body.status)) {
    throw createError({ statusCode: 400, statusMessage: 'A valid technician status is required.' })
  }
  return {
    data: await useCloudflareService(event).setTechnicianSecurityStatus(
      siteId, controlKey, body.status, body.notes ?? '', identity.email
    )
  }
})
