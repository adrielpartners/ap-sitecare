import { AuditService } from '../../services/audit-service'

export default defineEventHandler(() => {
  return { data: new AuditService().list() }
})
