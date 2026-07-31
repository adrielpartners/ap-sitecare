import { backupApiError } from '../../../../utils/backup-api'
import { getBackupService } from '../../../../utils/backups'

export default defineEventHandler(async (event) => {
  try {
    return { ok: true, data: await getBackupService(event).getSiteOverview(getRouterParam(event, 'id') ?? '') }
  } catch (error) {
    return backupApiError(event, error)
  }
})
