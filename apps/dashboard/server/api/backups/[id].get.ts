import { backupApiError } from '../../utils/backup-api'
import { getBackupService } from '../../utils/backups'

export default defineEventHandler((event) => {
  try {
    const backupId = getRouterParam(event, 'id') ?? ''
    return { ok: true, data: getBackupService(event).getBackupDetails(backupId) }
  } catch (error) {
    return backupApiError(event, error)
  }
})
