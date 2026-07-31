import { AuditService } from '../../services/audit-service'
import { requireAccessIdentity } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  return { data: await new AuditService().list(undefined, requireAccessIdentity(event).accessibleSiteIds) }
})
