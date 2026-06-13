import type { H3Event } from 'h3'
import { BackupDestinationService } from '../services/backup-destination-service'
import { getRuntimeSettings } from './config'

export function getBackupDestinationService(event?: H3Event): BackupDestinationService {
  const config = getRuntimeSettings(event)
  return new BackupDestinationService({
    credentialEncryptionKey: config.credentialEncryptionKey,
    dropboxAccessToken: config.integrations.dropboxAccessToken,
    dropboxBackupRoot: config.integrations.dropboxBackupRoot,
    dropboxAccountLabel: config.backups.dropboxAccountLabel,
    dropboxEnabled: String(config.backups.dropboxEnabled) !== 'false'
  })
}
