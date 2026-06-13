import { getBackupDestinationService } from '../../utils/backup-destinations'
import { backupApiError } from '../../utils/backup-api'

export default defineEventHandler((event) => {
  try {
    return { ok: true, data: getBackupDestinationService(event).list() }
  } catch (error) {
    return backupApiError(event, error)
  }
})
