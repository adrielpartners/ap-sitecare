import type { H3Event } from 'h3'
import { requireAccessIdentity } from './auth'

export function getDashboardActor(event: H3Event): string {
  return requireAccessIdentity(event).email
}

export function requireBodyString(body: Record<string, unknown>, key: string): string {
  const value = body[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw createError({ statusCode: 400, statusMessage: `${key} is required.` })
  }
  return value
}

export function optionalBodyString(body: Record<string, unknown>, key: string): string | null | undefined {
  const value = body[key]
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') throw createError({ statusCode: 400, statusMessage: `${key} must be a string.` })
  return value
}

export function handleApiError(error: unknown): never {
  if (error && typeof error === 'object' && 'statusCode' in error) throw error
  const message = error instanceof Error ? error.message : 'Unexpected request failure.'
  const statusCode = message === 'Site not found.' ? 404 : 400
  throw createError({ statusCode, statusMessage: message })
}
