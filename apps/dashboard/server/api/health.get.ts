import { getSystemHealth } from '../services/health-service'

export default defineEventHandler(async () => {
  return {
    ok: true,
    data: await getSystemHealth()
  }
})
