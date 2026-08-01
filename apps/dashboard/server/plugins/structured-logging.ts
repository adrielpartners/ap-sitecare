import { randomUUID } from 'node:crypto'
import { logOperationalEvent, safeOperationalError } from '../utils/structured-logger'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    const requestId = getHeader(event, 'x-request-id')?.slice(0, 100) || randomUUID()
    event.context.sitecareRequestId = requestId
    event.context.sitecareRequestStartedAt = Date.now()
    setResponseHeader(event, 'x-request-id', requestId)
  })
  nitroApp.hooks.hook('afterResponse', (event) => {
    const startedAt = Number(event.context.sitecareRequestStartedAt ?? Date.now())
    const durationMs = Date.now() - startedAt
    if (durationMs >= 2_000) {
      logOperationalEvent('warn', 'http.request.slow', {
        requestId: event.context.sitecareRequestId,
        method: event.method,
        path: getRequestURL(event).pathname,
        statusCode: getResponseStatus(event),
        durationMs
      })
    }
  })
  nitroApp.hooks.hook('error', (error, context) => {
    logOperationalEvent('error', 'http.request.failed', {
      requestId: context.event?.context.sitecareRequestId,
      method: context.event?.method,
      path: context.event ? getRequestURL(context.event).pathname : null,
      ...safeOperationalError(error)
    })
  })
})
