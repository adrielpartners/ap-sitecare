import type { H3Event } from 'h3'
import { IntegrationService } from '../services/integration-service'
import { getRuntimeSettings } from './config'

export function getIntegrationService(event?: H3Event): IntegrationService {
  return new IntegrationService(getRuntimeSettings(event).integrations)
}
