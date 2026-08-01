import type { SiteHealthApprovalStatus } from '../../../../domain/sitehealth'
import { SiteHealthService } from '../../../../services/sitehealth-service'
import { getDashboardActor, handleApiError, requireBodyString } from '../../../../utils/api'
import { requireDashboardPermission, requireDashboardSiteAccess } from '../../../../utils/auth'

export default defineEventHandler(async (event) => {
  try {
    const reviewId = getRouterParam(event, 'reviewId')
    if (!reviewId) throw createError({ statusCode: 400, statusMessage: 'Review ID is required.' })
    requireDashboardPermission(event, 'operations:write')
    const service = new SiteHealthService()
    const review = await service.getPublishedReview(reviewId)
    requireDashboardSiteAccess(event, review.siteId)
    const body = await readBody<Record<string, unknown>>(event)
    return { ok: true, data: await service.recordApproval(reviewId, {
      status: requireBodyString(body, 'status') as SiteHealthApprovalStatus,
      source: requireBodyString(body, 'source') as 'external-email' | 'phone' | 'other',
      notes: requireBodyString(body, 'notes')
    }, getDashboardActor(event)) }
  } catch (error) {
    handleApiError(error)
  }
})
