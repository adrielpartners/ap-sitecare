import { NotificationService } from '../../../../../../services/notification-service'
import { getDashboardActor, handleApiError } from '../../../../../../utils/api'

export default defineEventHandler(async (event) => {
  try {
    const siteId = getRouterParam(event, 'id')
    const recipientId = getRouterParam(event, 'recipientId')
    if (!siteId || !recipientId) throw createError({ statusCode: 400, statusMessage: 'Site and recipient IDs are required.' })
    await new NotificationService().deleteRecipient(siteId, recipientId, getDashboardActor(event))
    return { ok: true, data: { deleted: true } }
  } catch (error) {
    handleApiError(error)
  }
})
