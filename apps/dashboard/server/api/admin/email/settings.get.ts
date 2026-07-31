import { handleApiError } from '../../../utils/api'
import { getEmailConfigurationService } from '../../../utils/email-services'

export default defineEventHandler(async (event) => {
  try {
    return { ok: true, data: await getEmailConfigurationService(event).getSettings() }
  } catch (error) {
    handleApiError(error)
  }
})
