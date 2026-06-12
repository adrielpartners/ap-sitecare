import { getDashboardActor } from '../../../../utils/api'
import { backupApiError } from '../../../../utils/backup-api'
import { getBackupService } from '../../../../utils/backups'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, unknown>>(event)
    if (typeof body.backupId !== 'string' || !body.backupId) throw new Error('backupId is required.')
    return {
      ok: true,
      data: getBackupService(event).prepareRestore(
        getRouterParam(event, 'id') ?? '',
        body.backupId,
        getDashboardActor(event)
      )
    }
  } catch (error) {
    return backupApiError(event, error)
  }
})
