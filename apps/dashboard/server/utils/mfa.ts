import type { H3Event } from 'h3'
import { MfaService } from '../services/mfa-service'
import { getRuntimeSettings } from './config'

export function getMfaService(event?: H3Event): MfaService {
  const settings = getRuntimeSettings(event)
  return new MfaService(
    settings.credentialEncryptionKey,
    undefined,
    undefined,
    settings.auth.mfaChallengeMinutes,
    settings.auth.trustedDeviceDays
  )
}
