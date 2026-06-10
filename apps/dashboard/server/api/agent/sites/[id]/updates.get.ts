import { HealthService } from '../../../../services/health-service'

export default defineEventHandler((event) => {
  const health = new HealthService().getSummary(getRouterParam(event, 'id') ?? '')
  return {
    data: {
      siteId: health.siteId,
      pluginUpdateCount: health.latest?.pluginUpdateCount ?? null,
      themeUpdateCount: health.latest?.themeUpdateCount ?? null,
      reportedAt: health.latest?.createdAt ?? null
    }
  }
})
