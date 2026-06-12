import type { H3Event } from 'h3'
import { BackupService } from '../services/backup-service'
import { getRuntimeSettings } from './config'

export function getBackupService(event?: H3Event): BackupService {
  const config = getRuntimeSettings(event)
  return new BackupService({
    dropboxAccessToken: config.integrations.dropboxAccessToken,
    dropboxBackupRoot: config.integrations.dropboxBackupRoot,
    dropboxAccountLabel: config.backups.dropboxAccountLabel,
    dropboxEnabled: String(config.backups.dropboxEnabled) !== 'false',
    dropboxTokenStrategy: config.backups.dropboxTokenStrategy === 'oauth' ? 'oauth' : 'runtime-access-token',
    allowedLocalBaseDirectories: config.backups.allowedLocalBaseDirectories
      .split(',')
      .map(value => value.trim())
      .filter(Boolean),
    credentialEncryptionKey: config.credentialEncryptionKey
  })
}
