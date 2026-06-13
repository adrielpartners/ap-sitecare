import { setTimeout as delay } from 'node:timers/promises'
import { createDatabase } from '../server/utils/database'
import { AuditRepository } from '../server/repositories/audit-repository'
import { BackupRepository } from '../server/repositories/backup-repository'
import { SiteRepository } from '../server/repositories/site-repository'
import { AuditService } from '../server/services/audit-service'
import { BackupWorkerService } from '../server/services/backup-worker-service'
import { BackupDestinationRepository } from '../server/repositories/backup-destination-repository'
import { BackupDestinationService } from '../server/services/backup-destination-service'

const databasePath = process.env.NUXT_DATABASE_PATH || './data/sitecare.sqlite'
const database = createDatabase(databasePath)
const settings = {
  allowedLocalBaseDirectories: split(process.env.NUXT_BACKUPS_ALLOWED_LOCAL_BASE_DIRECTORIES),
  credentialEncryptionKey: process.env.NUXT_CREDENTIAL_ENCRYPTION_KEY || '',
  dropboxAccessToken: process.env.NUXT_INTEGRATIONS_DROPBOX_ACCESS_TOKEN || '',
  dropboxBackupRoot: process.env.NUXT_INTEGRATIONS_DROPBOX_BACKUP_ROOT || '',
  dropboxAccountLabel: process.env.NUXT_BACKUPS_DROPBOX_ACCOUNT_LABEL || '',
  dropboxEnabled: process.env.NUXT_BACKUPS_DROPBOX_ENABLED !== 'false',
  dropboxTokenStrategy: process.env.NUXT_BACKUPS_DROPBOX_TOKEN_STRATEGY === 'oauth' ? 'oauth' as const : 'runtime-access-token' as const,
  tempRoot: process.env.NUXT_BACKUPS_TEMP_ROOT || '/tmp/ap-sitecare-backups',
  staleAfterMinutes: positiveInteger(process.env.NUXT_BACKUPS_STALE_AFTER_MINUTES, 60)
}
const auditService = new AuditService(new AuditRepository(database))
const destinationService = new BackupDestinationService(settings, new BackupDestinationRepository(database), auditService)
const worker = new BackupWorkerService(
  settings,
  new BackupRepository(database),
  new SiteRepository(database),
  auditService,
  undefined,
  undefined,
  destinationService
)
const continuous = process.argv.includes('--continuous')

do {
  const result = await worker.runNext()
  if (!continuous) break
  if (!result) await delay(5000)
} while (continuous)

function split(value: string | undefined): string[] {
  return (value || '').split(',').map(item => item.trim()).filter(Boolean)
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}
