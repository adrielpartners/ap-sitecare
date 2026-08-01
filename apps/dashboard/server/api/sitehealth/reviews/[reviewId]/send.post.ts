import { SiteHealthService } from '../../../../services/sitehealth-service'
import { getDashboardActor, handleApiError } from '../../../../utils/api'
import { requireDashboardPermission, requireDashboardSiteAccess } from '../../../../utils/auth'

export default defineEventHandler(async (event) => {
  try {
    const reviewId = getRouterParam(event, 'reviewId')
    if (!reviewId) throw createError({ statusCode: 400, statusMessage: 'Review ID is required.' })
    requireDashboardPermission(event, 'operations:write')
    const service = new SiteHealthService()
    const review = await service.getPublishedReview(reviewId)
    requireDashboardSiteAccess(event, review.siteId)
    return { ok: true, data: await service.sendReview(reviewId, getDashboardActor(event)) }
  } catch (error) {
    handleApiError(error)
  }
})
