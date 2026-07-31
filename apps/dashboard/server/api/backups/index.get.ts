import { getBackupService } from '../../utils/backups'
import { requireAccessIdentity } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  return { ok: true, data: await getBackupService(event).listPolicies(requireAccessIdentity(event).accessibleSiteIds) }
})
