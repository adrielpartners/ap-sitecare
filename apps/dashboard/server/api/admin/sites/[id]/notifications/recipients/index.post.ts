import { isSiteNotificationCategory, type SiteNotificationCategory } from '../../../../../../email/notification-types'
import { NotificationService } from '../../../../../../services/notification-service'
import { getDashboardActor, handleApiError, optionalBodyString, requireBodyString } from '../../../../../../utils/api'

export default defineEventHandler(async (event) => {
  try {
    const siteId = getRouterParam(event, 'id')
    if (!siteId) throw createError({ statusCode: 400, statusMessage: 'Site ID is required.' })
    const body = await readBody<Record<string, unknown>>(event)
    if (!Array.isArray(body.categories) || body.categories.some(category => !isSiteNotificationCategory(category))) {
      throw createError({ statusCode: 400, statusMessage: 'All notification categories must be valid.' })
    }
    const categories = Array.isArray(body.categories)
      ? body.categories.filter(isSiteNotificationCategory) as SiteNotificationCategory[]
      : []
    return {
      ok: true,
      data: await new NotificationService().saveRecipient(siteId, {
        email: requireBodyString(body, 'email'),
        displayName: optionalBodyString(body, 'displayName'),
        enabled: body.enabled !== false,
        categories
      }, getDashboardActor(event))
    }
  } catch (error) {
    handleApiError(error)
  }
})
