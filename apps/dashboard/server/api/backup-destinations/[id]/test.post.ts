import { getDashboardActor } from '../../../utils/api'
import { backupApiError } from '../../../utils/backup-api'
import { getBackupDestinationService } from '../../../utils/backup-destinations'

export default defineEventHandler(async (event) => {
  try {
    return {
      ok: true,
      data: await getBackupDestinationService(event).test(getRouterParam(event, 'id') ?? '', getDashboardActor(event))
    }
  } catch (error) {
    return backupApiError(event, error)
  }
})
