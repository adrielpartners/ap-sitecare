import { AuditService } from '../../../services/audit-service'

export default defineEventHandler((event) => {
  return { data: new AuditService().listForSite(getRouterParam(event, 'id') ?? '') }
})
