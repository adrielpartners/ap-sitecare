import type { H3Event } from 'h3'
import { PluginAuthenticationService } from '../services/plugin-authentication-service'
import { getRuntimeSettings } from './config'

export async function authenticatePluginRequest(event: H3Event) {
  const settings = getRuntimeSettings(event)
  return new PluginAuthenticationService(settings.credentialEncryptionKey).authenticate(event)
}

export function parsePluginBody(rawBody: string): Record<string, unknown> {
  try {
    const body = JSON.parse(rawBody || '{}')
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error()
    return body as Record<string, unknown>
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Plugin request body must be a JSON object.' })
  }
}
