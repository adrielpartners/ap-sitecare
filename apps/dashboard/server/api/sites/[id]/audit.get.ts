import { AuditService } from '../../../services/audit-service'

export default defineEventHandler(async (event) => {
  return { data: await new AuditService().listForSite(getRouterParam(event, 'id') ?? '') }
})
