import { getDashboardActor } from '../../../utils/api'
import { backupApiError } from '../../../utils/backup-api'
import { requireBackupAccess } from '../../../utils/backups'

export default defineEventHandler(async (event) => {
  try {
    const backupId = getRouterParam(event, 'id') ?? ''
    const service = await requireBackupAccess(event, backupId)
    return { ok: true, data: await service.getDownloadLinks(backupId, getDashboardActor(event)) }
  } catch (error) {
    return backupApiError(event, error)
  }
})
