import { canAccessSite } from '../../../../auth/authorization'
import { NotificationService } from '../../../../services/notification-service'
import { requireAccessIdentity } from '../../../../utils/auth'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'id')
  const identity = requireAccessIdentity(event)
  if (!siteId || !canAccessSite(identity, siteId)) throw createError({ statusCode: 404, statusMessage: 'Site not found.' })
  return { ok: true, data: await new NotificationService().listRecipients(siteId) }
})
