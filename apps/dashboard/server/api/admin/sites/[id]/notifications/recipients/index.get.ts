import { NotificationService } from '../../../../../../services/notification-service'
import { handleApiError } from '../../../../../../utils/api'

export default defineEventHandler(async (event) => {
  try {
    const siteId = getRouterParam(event, 'id')
    if (!siteId) throw createError({ statusCode: 400, statusMessage: 'Site ID is required.' })
    return { ok: true, data: await new NotificationService().listRecipients(siteId) }
  } catch (error) {
    handleApiError(error)
  }
})
