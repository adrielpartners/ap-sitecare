import { getDataFoundationStatus } from '../services/data-foundation-service'

export default defineEventHandler(() => {
  return { ok: true, data: getDataFoundationStatus() }
})
