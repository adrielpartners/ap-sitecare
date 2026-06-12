import { getDashboardActor } from '../../../../utils/api'
import { backupApiError, parseBackupPolicyBody } from '../../../../utils/backup-api'
import { getBackupService } from '../../../../utils/backups'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, unknown>>(event)
    return {
      ok: true,
      data: getBackupService(event).updatePolicy(
        getRouterParam(event, 'id') ?? '',
        parseBackupPolicyBody(body),
        getDashboardActor(event)
      )
    }
  } catch (error) {
    return backupApiError(event, error)
  }
})
