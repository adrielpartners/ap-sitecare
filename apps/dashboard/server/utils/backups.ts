import type { H3Event } from 'h3'
import { BackupService } from '../services/backup-service'
import { requireDashboardSiteAccess } from './auth'
import { getRuntimeSettings } from './config'

export function getBackupService(event?: H3Event): BackupService {
  const config = getRuntimeSettings(event)
  return new BackupService({
    dropboxAccessToken: config.integrations.dropboxAccessToken,
    dropboxRefreshToken: config.integrations.dropboxRefreshToken,
    dropboxAppKey: config.integrations.dropboxAppKey,
    dropboxAppSecret: config.integrations.dropboxAppSecret,
    dropboxRedirectUri: config.integrations.dropboxRedirectUri,
    dropboxBackupRoot: config.integrations.dropboxBackupRoot,
    dropboxAccountLabel: config.backups.dropboxAccountLabel,
    dropboxEnabled: String(config.backups.dropboxEnabled) !== 'false',
    dropboxTokenStrategy: config.backups.dropboxTokenStrategy === 'oauth' ? 'oauth' : 'runtime-access-token',
    allowedLocalBaseDirectories: config.backups.allowedLocalBaseDirectories
      .split(',')
      .map(value => value.trim())
      .filter(Boolean),
    credentialEncryptionKey: config.credentialEncryptionKey,
    tempRoot: config.backups.tempRoot
  })
}

export async function requireBackupAccess(event: H3Event, backupId: string): Promise<BackupService> {
  const service = getBackupService(event)
  const details = await service.getBackupDetails(backupId)
  requireDashboardSiteAccess(event, details.artifact.siteId)
  return service
}
