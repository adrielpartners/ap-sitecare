import type { H3Event } from 'h3'
import { NotificationRepository } from '../repositories/notification-repository'
import { EmailConfigurationService, emailRuntimeSettings } from '../services/email-configuration-service'
import { getRuntimeSettings } from './config'
import { useDatabase } from './database'

export function getEmailConfigurationService(event?: H3Event): EmailConfigurationService {
  const database = useDatabase()
  return new EmailConfigurationService(
    emailRuntimeSettings(getRuntimeSettings(event)),
    new NotificationRepository(database)
  )
}
