import { DashboardService } from '../services/dashboard-service'
import { requireAccessIdentity } from '../utils/auth'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = Number(query.page ?? 1)
  const pageSize = Number(query.pageSize ?? 5)
  const search = typeof query.search === 'string' ? query.search : ''
  const identity = requireAccessIdentity(event)
  return { data: await new DashboardService().getOverview(page, pageSize, search, new Date(), identity.accessibleSiteIds) }
})
