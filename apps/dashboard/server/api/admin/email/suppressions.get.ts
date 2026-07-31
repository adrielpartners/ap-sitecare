import { NotificationRepository } from '../../../repositories/notification-repository'
import { handleApiError } from '../../../utils/api'

export default defineEventHandler(async () => {
  try {
    return { ok: true, data: await new NotificationRepository().listSuppressions() }
  } catch (error) {
    handleApiError(error)
  }
})
