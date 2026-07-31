import { requireDashboardSiteAccess } from '../../../../../utils/auth'
import { useCloudflareService } from '../../../../../utils/cloudflare-services'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'id')
  const incidentId = getRouterParam(event, 'incidentId')
  if (!siteId || !incidentId) throw createError({ statusCode: 400, statusMessage: 'Site and incident are required.' })
  const identity = requireDashboardSiteAccess(event, siteId)
  const body = await readBody<{ recoveryNotes?: string | null, restoredBackupReference?: string | null, sendReport?: boolean }>(event)
  return {
    data: await useCloudflareService(event).updateRecoveryReport(siteId, incidentId, body, identity.email)
  }
})
