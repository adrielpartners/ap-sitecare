import { backupApiError } from '../../../utils/backup-api'
import { requireBackupAccess } from '../../../utils/backups'

export default defineEventHandler(async (event) => {
  try {
    const backupId = getRouterParam(event, 'id') ?? ''
    return { ok: true, data: await (await requireBackupAccess(event, backupId)).getClientSafeManifest(backupId) }
  } catch (error) {
    return backupApiError(event, error)
  }
})
