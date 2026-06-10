import { ActionRequestService } from '../../services/action-request-service'

export default defineEventHandler(() => {
  return { data: new ActionRequestService().list() }
})
