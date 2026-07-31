import { getDataFoundationStatus } from '../services/data-foundation-service'

export default defineEventHandler(async () => {
  return { ok: true, data: await getDataFoundationStatus() }
})
