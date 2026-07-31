import { ActionRequestService } from '../../services/action-request-service'
import { requireAccessIdentity } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  return { data: await new ActionRequestService().list(requireAccessIdentity(event).accessibleSiteIds) }
})
