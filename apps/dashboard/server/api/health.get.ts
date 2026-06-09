import { getSystemHealth } from '../services/health-service'

export default defineEventHandler(() => {
  return {
    ok: true,
    data: getSystemHealth()
  }
})
