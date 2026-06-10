import { DashboardService } from '../services/dashboard-service'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const page = Number(query.page ?? 1)
  const pageSize = Number(query.pageSize ?? 5)
  const search = typeof query.search === 'string' ? query.search : ''
  return { data: new DashboardService().getOverview(page, pageSize, search) }
})
