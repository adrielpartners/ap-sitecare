import { getDashboardActor } from '../../../utils/api'
import { backupApiError } from '../../../utils/backup-api'
import { getBackupDestinationService } from '../../../utils/backup-destinations'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, unknown>>(event)
    if (body.mode !== 'master' && body.mode !== 'override') throw new Error('Unsupported backup destination mode.')
    if (typeof body.allowMultiple !== 'boolean') throw new Error('allowMultiple must be true or false.')
    if (!Array.isArray(body.destinationIds) || body.destinationIds.some(value => typeof value !== 'string')) {
      throw new Error('destinationIds must be a list of destination IDs.')
    }
    return {
      ok: true,
      data: getBackupDestinationService(event).saveSiteSettings(
        getRouterParam(event, 'id') ?? '',
        body.mode,
        body.allowMultiple,
        body.destinationIds as string[],
        getDashboardActor(event)
      )
    }
  } catch (error) {
    return backupApiError(event, error)
  }
})
