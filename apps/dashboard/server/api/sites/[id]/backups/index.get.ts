import { backupApiError } from '../../../../utils/backup-api'
import { getBackupService } from '../../../../utils/backups'

export default defineEventHandler((event) => {
  try {
    return { ok: true, data: getBackupService(event).getSiteOverview(getRouterParam(event, 'id') ?? '') }
  } catch (error) {
    return backupApiError(event, error)
  }
})
