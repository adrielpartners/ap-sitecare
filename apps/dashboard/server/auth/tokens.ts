import { createHash, createHmac, randomBytes } from 'node:crypto'

export function createOpaqueToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

export function hashNetworkIdentifier(value: string, key: string): string | null {
  if (!value || !key) return null
  return createHmac('sha256', key).update(value).digest('base64url')
}

export function verifyCsrfToken(
  cookieToken: string | undefined,
  headerToken: string | undefined,
  storedTokenHash: string
): boolean {
  return Boolean(
    cookieToken
    && headerToken
    && cookieToken === headerToken
    && hashToken(headerToken) === storedTokenHash
  )
}
