import { getDashboardActor } from '../../utils/api'
import { backupApiError } from '../../utils/backup-api'
import { getBackupDestinationService } from '../../utils/backup-destinations'
import { parseDestination } from './index.post'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, unknown>>(event)
    return {
      ok: true,
      data: getBackupDestinationService(event).save({
        ...parseDestination(body),
        id: getRouterParam(event, 'id') ?? ''
      }, getDashboardActor(event))
    }
  } catch (error) {
    return backupApiError(event, error)
  }
})
