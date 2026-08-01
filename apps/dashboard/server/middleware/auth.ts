import { hashToken, verifyCsrfToken } from '../auth/tokens'
import { hasPermission, requireSiteAccess } from '../auth/authorization'
import { SessionService } from '../services/session-service'
import { getRuntimeSettings } from '../utils/config'

const PUBLIC_PATHS = new Set([
  '/api/health',
  '/api/auth/login',
  '/api/auth/mfa/verify',
  '/api/auth/invitations/accept',
  '/api/auth/password-reset/request',
  '/api/auth/password-reset/complete',
  '/login',
  '/forgot-password',
  '/reset-password',
  '/invitation'
])
const PUBLIC_PREFIXES = [
  '/_nuxt/',
  '/__nuxt_error',
  '/api/plugin/',
  '/api/webhooks/email/',
  '/api/webhooks/cloudflare/'
]
const SESSION_COOKIE = 'sitecare_session'
const CSRF_COOKIE = 'sitecare_csrf'
const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname

  if (PUBLIC_PATHS.has(path) || PUBLIC_PREFIXES.some(prefix => path.startsWith(prefix))) {
    return
  }

  const sessionToken = getCookie(event, SESSION_COOKIE)
  const identity = sessionToken
    ? await new SessionService(
        undefined,
        getRuntimeSettings(event).auth.sessionDays,
        getRuntimeSettings(event).auth.idleHours
      ).resolve(sessionToken)
    : null

  if (!identity) {
    if (path.startsWith('/api/')) {
      throw createError({ statusCode: 401, statusMessage: 'Authentication is required.' })
    }
    return sendRedirect(event, `/login?redirect=${encodeURIComponent(path)}`, 302)
  }
  event.context.sitecareIdentity = identity

  if (path.startsWith('/api/') && unsafeMethods.has(event.method)) {
    const fetchSite = getHeader(event, 'sec-fetch-site')
    if (fetchSite === 'cross-site') {
      throw createError({ statusCode: 403, statusMessage: 'Cross-site requests are not permitted.' })
    }
    const origin = getHeader(event, 'origin')
    const expectedHost = getHeader(event, 'x-forwarded-host') || getHeader(event, 'host')
    if (origin && expectedHost && !sameRequestHost(origin, expectedHost)) {
      throw createError({ statusCode: 403, statusMessage: 'The request origin is not permitted.' })
    }
    const csrfCookie = getCookie(event, CSRF_COOKIE)
    const csrfHeader = getHeader(event, 'x-sitecare-csrf')
    const repository = new (await import('../repositories/identity-repository')).IdentityRepository()
    const stored = await repository.findActiveSessionByTokenHash(hashToken(sessionToken!), new Date().toISOString())
    if (!stored || !verifyCsrfToken(csrfCookie, csrfHeader, stored.csrfTokenHash)) {
      throw createError({ statusCode: 403, statusMessage: 'The request could not be verified.' })
    }
  }

  enforceRouteAuthorization(path, event.method, identity)
})

function sameRequestHost(origin: string, expectedHost: string): boolean {
  try { return new URL(origin).host === expectedHost }
  catch { return false }
}

function enforceRouteAuthorization(
  path: string,
  method: string,
  identity: NonNullable<Awaited<ReturnType<SessionService['resolve']>>>
): void {
  if (!path.startsWith('/api/')) return
  if (path === '/api/session' || path.startsWith('/api/profile/') || path.startsWith('/api/auth/')) return

  if (identity.role === 'client') {
    if (!path.startsWith('/api/client/')) {
      throw createError({ statusCode: 403, statusMessage: 'This resource is not available in the client portal.' })
    }
    return
  }

  if (
    path.startsWith('/api/admin/')
    || path === '/api/data-foundation'
    || path === '/api/integrations/status'
  ) requireAllowed(identity, 'identity:manage')
  else if (path.startsWith('/api/backup-destinations') || path.startsWith('/api/backup-storage')) {
    requireAllowed(identity, 'destinations:manage')
  } else if (path.includes('/credentials') || path.endsWith('/connection/revoke')) {
    requireAllowed(identity, 'credentials:manage')
  } else if (/\/action-requests\/[^/]+\/(approve|reject)$/.test(path)) {
    requireAllowed(identity, 'action:review')
  } else if (
    path === '/api/sites'
    && method === 'POST'
    && identity.role === 'team-member'
    && identity.accessibleSiteIds !== null
  ) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Restricted Team Members cannot register sites outside their assigned scope.'
    })
  } else if (method === 'GET') {
    requireAllowed(identity, 'operations:read')
  } else {
    requireAllowed(identity, 'operations:write')
  }

  const siteId = path.match(/^\/api\/(?:agent\/)?sites\/([^/]+)/)?.[1]
  if (siteId) requireSiteAccess(identity, decodeURIComponent(siteId))
}

function requireAllowed(
  identity: NonNullable<Awaited<ReturnType<SessionService['resolve']>>>,
  permission: Parameters<typeof hasPermission>[1]
): void {
  if (!hasPermission(identity, permission)) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to perform this action.' })
  }
}
