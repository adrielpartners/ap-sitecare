import { getDashboardActor } from '../../../../utils/api'
import { backupApiError } from '../../../../utils/backup-api'
import { getBackupService } from '../../../../utils/backups'

export default defineEventHandler(async (event) => {
  try {
    return {
      ok: true,
      data: await getBackupService(event).planManualBackup(getRouterParam(event, 'id') ?? '', getDashboardActor(event))
    }
  } catch (error) {
    return backupApiError(event, error)
  }
})
