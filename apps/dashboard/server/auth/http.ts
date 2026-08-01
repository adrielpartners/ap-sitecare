import type { H3Event } from 'h3'
import type { CreatedSession } from '../services/session-service'
import { hashNetworkIdentifier } from './tokens'
import { getRuntimeSettings } from '../utils/config'

export const SESSION_COOKIE = 'sitecare_session'
export const CSRF_COOKIE = 'sitecare_csrf'
export const TRUSTED_DEVICE_COOKIE = 'sitecare_trusted_device'

export function setAuthenticationCookies(event: H3Event, created: CreatedSession): void {
  const config = getRuntimeSettings(event)
  const secure = config.auth.secureCookies || process.env.NODE_ENV === 'production'
  const maxAge = Math.max(0, Math.floor((new Date(created.session.expiresAt).getTime() - Date.now()) / 1000))
  setCookie(event, SESSION_COOKIE, created.sessionToken, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
    maxAge
  })
  setCookie(event, CSRF_COOKIE, created.csrfToken, {
    httpOnly: false,
    secure,
    sameSite: 'strict',
    path: '/',
    maxAge
  })
}

export function clearAuthenticationCookies(event: H3Event): void {
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
  deleteCookie(event, CSRF_COOKIE, { path: '/' })
}

export function setTrustedDeviceCookie(event: H3Event, token: string, expiresAt: string): void {
  const config = getRuntimeSettings(event)
  const secure = config.auth.secureCookies || process.env.NODE_ENV === 'production'
  const maxAge = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
  setCookie(event, TRUSTED_DEVICE_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
    maxAge
  })
}

export function clearTrustedDeviceCookie(event: H3Event): void {
  deleteCookie(event, TRUSTED_DEVICE_COOKIE, { path: '/' })
}

export function getLoginContext(event: H3Event): { ipHash: string | null, userAgent: string | null } {
  const config = getRuntimeSettings(event)
  const networkAddress = getHeader(event, 'cf-connecting-ip')
    || getRequestIP(event, { xForwardedFor: true })
    || ''
  return {
    ipHash: hashNetworkIdentifier(networkAddress, config.auth.eventHashKey),
    userAgent: getHeader(event, 'user-agent')?.slice(0, 1000) || null
  }
}
