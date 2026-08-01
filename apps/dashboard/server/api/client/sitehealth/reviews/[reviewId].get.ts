import { canAccessSite } from '../../../../auth/authorization'
import { SiteHealthService } from '../../../../services/sitehealth-service'
import { handleApiError } from '../../../../utils/api'
import { requireDashboardPermission } from '../../../../utils/auth'

export default defineEventHandler(async (event) => {
  try {
    const reviewId = getRouterParam(event, 'reviewId')
    if (!reviewId) throw createError({ statusCode: 400, statusMessage: 'Review ID is required.' })
    const identity = requireDashboardPermission(event, 'portal:read')
    const review = await new SiteHealthService().getClientPublishedReview(reviewId)
    if (!canAccessSite(identity, review.siteId)) throw createError({ statusCode: 404, statusMessage: 'SiteHealth Review not found.' })
    return { ok: true, data: review }
  } catch (error) {
    handleApiError(error)
  }
})
