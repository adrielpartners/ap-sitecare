import { SiteHealthService } from '../../../../services/sitehealth-service'
import { handleApiError } from '../../../../utils/api'
import { requireDashboardPermission, requireDashboardSiteAccess } from '../../../../utils/auth'

export default defineEventHandler(async (event) => {
  try {
    const reviewId = getRouterParam(event, 'reviewId')
    if (!reviewId) throw createError({ statusCode: 400, statusMessage: 'Review ID is required.' })
    requireDashboardPermission(event, 'operations:read')
    const review = await new SiteHealthService().getPublishedReview(reviewId)
    requireDashboardSiteAccess(event, review.siteId)
    return { ok: true, data: review }
  } catch (error) {
    handleApiError(error)
  }
})
