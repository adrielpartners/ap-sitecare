import { getBackupDestinationService } from '../../utils/backup-destinations'
import { backupApiError } from '../../utils/backup-api'

export default defineEventHandler(async (event) => {
  try {
    return { ok: true, data: await getBackupDestinationService(event).list() }
  } catch (error) {
    return backupApiError(event, error)
  }
})
