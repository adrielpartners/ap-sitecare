import { calculateSnapshotStatus, HealthService } from './health-service'
import type { DetectedBackupSourceInput } from './backup-service'
import { BackupService } from './backup-service'

interface PluginCheckInPayload {
  wordpressVersion: string | null
  phpVersion: string | null
  pluginUpdateCount: number
  themeUpdateCount: number
  lastCronRunAt: string | null
  backupSource?: Record<string, unknown>
}

function optionalString(value: unknown, key: string): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') throw new Error(`${key} must be a string or null.`)
  return value
}

function updateCount(value: unknown, key: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`${key} must be a non-negative integer.`)
  return value as number
}

export class PluginReportingService {
  constructor(
    private readonly healthService = new HealthService(),
    private readonly backupService: BackupService | null = null
  ) {}

  testConnection(siteId: string): { connected: true, siteId: string } {
    return { connected: true, siteId }
  }

  recordCheckIn(siteId: string, requestTimestamp: string, payload: Record<string, unknown>) {
    const detectedBackupSource = this.normalizeBackupSource(payload.backupSource)
    let backupSourceError: string | null = null
    if (detectedBackupSource && this.backupService) {
      try {
        this.backupService.recordDetectedBackupSource(siteId, detectedBackupSource)
      } catch (error) {
        backupSourceError = error instanceof Error ? error.message : 'Backup source detection could not be saved.'
      }
    }

    const normalized: PluginCheckInPayload = {
      wordpressVersion: optionalString(payload.wordpressVersion, 'wordpressVersion'),
      phpVersion: optionalString(payload.phpVersion, 'phpVersion'),
      pluginUpdateCount: updateCount(payload.pluginUpdateCount, 'pluginUpdateCount'),
      themeUpdateCount: updateCount(payload.themeUpdateCount, 'themeUpdateCount'),
      lastCronRunAt: optionalString(payload.lastCronRunAt, 'lastCronRunAt'),
      ...(detectedBackupSource ? { backupSource: { ...this.redactBackupSource(detectedBackupSource), saveError: backupSourceError } } : {})
    }

    return this.healthService.recordCheckIn({
      siteId,
      source: 'wordpress-plugin',
      requestTimestamp,
      payload: normalized as unknown as Record<string, unknown>,
      status: calculateSnapshotStatus(normalized.pluginUpdateCount, normalized.themeUpdateCount),
      ...normalized
    })
  }

  private normalizeBackupSource(value: unknown): DetectedBackupSourceInput | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const source = value as Record<string, unknown>
    return {
      wordpressPath: optionalString(source.wordpressPath, 'backupSource.wordpressPath'),
      databaseHost: optionalString(source.databaseHost, 'backupSource.databaseHost'),
      databasePort: source.databasePort === null || source.databasePort === undefined
        ? null
        : updateCount(source.databasePort, 'backupSource.databasePort'),
      databaseName: optionalString(source.databaseName, 'backupSource.databaseName'),
      databaseUsername: optionalString(source.databaseUsername, 'backupSource.databaseUsername'),
      databasePassword: optionalString(source.databasePassword, 'backupSource.databasePassword'),
      providerLabel: optionalString(source.providerLabel, 'backupSource.providerLabel'),
      detectedAt: optionalString(source.detectedAt, 'backupSource.detectedAt')
    }
  }

  private redactBackupSource(source: DetectedBackupSourceInput): Record<string, unknown> {
    return {
      wordpressPath: source.wordpressPath,
      databaseHost: source.databaseHost,
      databasePort: source.databasePort,
      databaseName: source.databaseName,
      databaseUsername: source.databaseUsername,
      databasePasswordConfigured: Boolean(source.databasePassword),
      providerLabel: source.providerLabel,
      detectedAt: source.detectedAt
    }
  }
}
