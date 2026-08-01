import type { H3Event } from 'h3'
import { AuthenticationService } from '../services/authentication-service'
import { getRuntimeSettings } from './config'

export function getAuthenticationService(event?: H3Event): AuthenticationService {
  const config = getRuntimeSettings(event)
  return new AuthenticationService(
    undefined,
    undefined,
    undefined,
    config.sitecareBaseUrl,
    config.auth.sessionDays,
    config.auth.idleHours
  )
}
