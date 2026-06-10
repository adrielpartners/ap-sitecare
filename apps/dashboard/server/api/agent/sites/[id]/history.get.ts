import { AuditService } from '../../../../services/audit-service'
import { HealthService } from '../../../../services/health-service'

export default defineEventHandler((event) => {
  const siteId = getRouterParam(event, 'id') ?? ''
  return {
    data: {
      auditEvents: new AuditService().listForSite(siteId),
      checkIns: new HealthService().listCheckIns(siteId)
    }
  }
})
