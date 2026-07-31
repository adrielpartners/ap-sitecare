import { AuditService } from '../../../../services/audit-service'
import { NotificationRepository } from '../../../../repositories/notification-repository'
import { getDashboardActor, handleApiError, requireBodyString } from '../../../../utils/api'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<Record<string, unknown>>(event)
    const email = requireBodyString(body, 'email').trim().toLowerCase()
    const actor = getDashboardActor(event)
    const lifted = await new NotificationRepository().liftSuppression(email, actor, new Date().toISOString())
    if (!lifted) throw new Error('Active email suppression not found.')
    await new AuditService().record({
      actorType: 'dashboard-user',
      actorIdentifier: actor,
      eventType: 'email.suppression.lifted',
      metadata: { email }
    })
    return { ok: true, data: { email, lifted: true } }
  } catch (error) {
    handleApiError(error)
  }
})
