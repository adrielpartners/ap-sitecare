import { SiteService } from '../../../services/site-service'
import { getDashboardActor, handleApiError } from '../../../utils/api'

export default defineEventHandler((event) => {
  try {
    const siteId = getRouterParam(event, 'id')
    if (!siteId) throw createError({ statusCode: 400, statusMessage: 'Site ID is required.' })
    return { ok: true, data: new SiteService().disable(siteId, getDashboardActor(event)) }
  } catch (error) {
    handleApiError(error)
  }
})
