import { SiteService } from '../../services/site-service'

export default defineEventHandler(() => {
  return { ok: true, data: new SiteService().list() }
})
