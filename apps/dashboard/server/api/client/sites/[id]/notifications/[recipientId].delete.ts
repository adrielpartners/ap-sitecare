import { canAccessSite } from '../../../../../auth/authorization'
import { NotificationService } from '../../../../../services/notification-service'
import { handleApiError } from '../../../../../utils/api'
import { requireAccessIdentity } from '../../../../../utils/auth'

export default defineEventHandler(async (event) => {
  try {
    const siteId = getRouterParam(event, 'id')
    const recipientId = getRouterParam(event, 'recipientId')
    const identity = requireAccessIdentity(event)
    if (!siteId || !recipientId || !canAccessSite(identity, siteId)) throw createError({ statusCode: 404, statusMessage: 'Site not found.' })
    await new NotificationService().deleteRecipient(siteId, recipientId, identity.email)
    return { ok: true }
  } catch (error) { handleApiError(error) }
})
