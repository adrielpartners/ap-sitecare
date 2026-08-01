import { canAccessSite } from '../../../../auth/authorization'
import { isSiteNotificationCategory } from '../../../../email/notification-types'
import { NotificationService } from '../../../../services/notification-service'
import { handleApiError } from '../../../../utils/api'
import { requireAccessIdentity } from '../../../../utils/auth'

export default defineEventHandler(async (event) => {
  try {
    const siteId = getRouterParam(event, 'id')
    const identity = requireAccessIdentity(event)
    if (!siteId || !canAccessSite(identity, siteId)) throw createError({ statusCode: 404, statusMessage: 'Site not found.' })
    const body = await readBody<Record<string, unknown>>(event)
    if (typeof body.email !== 'string' || !Array.isArray(body.categories)) throw new Error('Email and notification categories are required.')
    const categories = body.categories.filter(isSiteNotificationCategory)
    if (categories.length !== body.categories.length) throw new Error('A notification category is not supported.')
    return { ok: true, data: await new NotificationService().saveRecipient(siteId, {
      id: typeof body.id === 'string' ? body.id : undefined,
      email: body.email, displayName: typeof body.displayName === 'string' ? body.displayName : null,
      enabled: body.enabled !== false, categories
    }, identity.email) }
  } catch (error) { handleApiError(error) }
})
