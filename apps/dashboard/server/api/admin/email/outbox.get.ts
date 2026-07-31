import { emailOutboxStatuses, type EmailOutboxStatus } from '../../../email/types'
import { EmailOutboxRepository } from '../../../repositories/email-outbox-repository'
import { handleApiError } from '../../../utils/api'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const status = typeof query.status === 'string' ? query.status : undefined
    const limit = typeof query.limit === 'string' ? Number.parseInt(query.limit, 10) : undefined
    if (status && !emailOutboxStatuses.includes(status as EmailOutboxStatus)) {
      throw createError({ statusCode: 400, statusMessage: 'Unsupported email outbox status.' })
    }
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 500)) {
      throw createError({ statusCode: 400, statusMessage: 'Limit must be a whole number from 1 to 500.' })
    }
    return {
      ok: true,
      data: await new EmailOutboxRepository().list({
        siteId: typeof query.siteId === 'string' ? query.siteId : undefined,
        status: status as EmailOutboxStatus | undefined,
        limit
      })
    }
  } catch (error) {
    handleApiError(error)
  }
})
