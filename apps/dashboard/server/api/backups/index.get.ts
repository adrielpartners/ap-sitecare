import { getBackupService } from '../../utils/backups'

export default defineEventHandler((event) => {
  return { ok: true, data: getBackupService(event).listPolicies() }
})
