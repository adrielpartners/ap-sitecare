import { AuditService } from '../../../../services/audit-service'
import { HealthService } from '../../../../services/health-service'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'id') ?? ''
  const [auditEvents, checkIns] = await Promise.all([
    new AuditService().listForSite(siteId),
    new HealthService().listCheckIns(siteId)
  ])
  return {
    data: {
      auditEvents,
      checkIns
    }
  }
})
