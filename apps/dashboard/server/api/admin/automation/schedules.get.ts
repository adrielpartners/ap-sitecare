import { SchedulerService } from '../../../services/automation-service'
import { handleApiError } from '../../../utils/api'

export default defineEventHandler(async () => {
  try {
    return { ok: true, data: await new SchedulerService().list() }
  } catch (error) {
    handleApiError(error)
  }
})
