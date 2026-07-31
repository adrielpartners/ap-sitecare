import { EntitlementService } from '../../../../services/entitlement-service'
import { WordPressUpdateService } from '../../../../services/wordpress-update-service'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'id') ?? ''
  const [updates, entitlements] = await Promise.all([
    new WordPressUpdateService().getSiteDetail(siteId),
    new EntitlementService().get(siteId)
  ])
  return {
    data: {
      siteId,
      monitoringEnabled: entitlements.capabilities['wordpress-update-monitoring'],
      serviceStatus: entitlements.operationalStatus,
      snapshot: updates.snapshot,
      inventory: updates.inventory,
      activities: updates.activities,
      stale: updates.stale
    }
  }
})
