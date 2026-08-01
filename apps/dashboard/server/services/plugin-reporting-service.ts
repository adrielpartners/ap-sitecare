import { calculateSnapshotStatus, HealthService } from './health-service'
import type { DetectedBackupSourceInput } from './backup-service'
import { BackupService } from './backup-service'
import { EntitlementService } from './entitlement-service'
import { CredentialService } from './credential-service'
import { WordPressUpdateService } from './wordpress-update-service'
import { normalizePluginSiteHealthEvidence, type NormalizedPluginSiteHealthEvidence } from './sitehealth-plugin-evidence'

interface UpdateMonitoringEntitlementGate {
  assertCapability(siteId: string, capability: 'wordpress-update-monitoring'): Promise<unknown>
}

interface PluginCheckInPayload {
  contractVersion: number
  pluginVersion: string | null
  wordpressHomeUrl: string | null
  wordpressVersion: string | null
  phpVersion: string | null
  pluginUpdateCount: number
  themeUpdateCount: number
  lastCronRunAt: string | null
  backupSource?: Record<string, unknown>
  siteHealthEvidence?: NormalizedPluginSiteHealthEvidence
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

function contractVersion(value: unknown): number {
  if (value === undefined || value === null) return 1
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 3) {
    throw new Error('contractVersion must be a supported positive integer.')
  }
  return value as number
}

export class PluginReportingService {
  constructor(
    private readonly healthService = new HealthService(),
    private readonly backupService: BackupService | null = null,
    private readonly entitlements: UpdateMonitoringEntitlementGate = new EntitlementService(),
    private readonly updateService: WordPressUpdateService | null = null,
    private readonly credentialService: CredentialService | null = null
  ) {}

  testConnection(siteId: string): { connected: true, siteId: string } {
    return { connected: true, siteId }
  }

  async recordCheckIn(siteId: string, requestTimestamp: string, payload: Record<string, unknown>) {
    await this.entitlements.assertCapability(siteId, 'wordpress-update-monitoring')
    const reportedContractVersion = contractVersion(payload.contractVersion)
    const updateService = reportedContractVersion >= 2
      ? this.updateService ?? new WordPressUpdateService()
      : null
    const updateReport = updateService?.normalize(payload, reportedContractVersion) ?? null
    const detectedBackupSource = this.normalizeBackupSource(payload.backupSource)
    const siteHealthEvidence = reportedContractVersion >= 3
      ? normalizePluginSiteHealthEvidence(payload.siteHealthEvidence)
      : null
    let backupSourceError: string | null = null
    if (detectedBackupSource && this.backupService) {
      try {
        await this.backupService.recordDetectedBackupSource(siteId, detectedBackupSource)
      } catch (error) {
        backupSourceError = error instanceof Error ? error.message : 'Backup source detection could not be saved.'
      }
    }

    const pluginUpdateCount = updateReport
      ? updateReport.inventory.filter(item => item.componentType === 'plugin' && item.availableVersion && item.availableVersion !== item.installedVersion).length
      : updateCount(payload.pluginUpdateCount, 'pluginUpdateCount')
    const themeUpdateCount = updateReport
      ? updateReport.inventory.filter(item => item.componentType === 'theme' && item.availableVersion && item.availableVersion !== item.installedVersion).length
      : updateCount(payload.themeUpdateCount, 'themeUpdateCount')
    const coreUpdateCount = updateReport?.snapshot.coreAvailableVersion
      && updateReport.snapshot.coreAvailableVersion !== updateReport.snapshot.coreInstalledVersion ? 1 : 0
    const normalized: PluginCheckInPayload = {
      contractVersion: reportedContractVersion,
      pluginVersion: optionalString(payload.pluginVersion, 'pluginVersion'),
      wordpressHomeUrl: optionalString(payload.wordpressHomeUrl, 'wordpressHomeUrl'),
      wordpressVersion: optionalString(payload.wordpressVersion, 'wordpressVersion'),
      phpVersion: optionalString(payload.phpVersion, 'phpVersion'),
      pluginUpdateCount,
      themeUpdateCount,
      lastCronRunAt: optionalString(payload.lastCronRunAt, 'lastCronRunAt'),
      ...(updateReport ? {
        updateSummary: {
          checkedAt: updateReport.snapshot.checkedAt,
          pendingUpdateCount: updateReport.snapshot.pendingUpdateCount,
          activityCount: updateReport.activities.length
        }
      } : {}),
      ...(detectedBackupSource ? { backupSource: { ...this.redactBackupSource(detectedBackupSource), saveError: backupSourceError } } : {}),
      ...(siteHealthEvidence ? { siteHealthEvidence } : {})
    } as PluginCheckInPayload

    const health = await this.healthService.recordCheckIn({
      siteId,
      source: 'wordpress-plugin',
      requestTimestamp,
      payload: normalized as unknown as Record<string, unknown>,
      status: calculateSnapshotStatus(normalized.pluginUpdateCount + coreUpdateCount, normalized.themeUpdateCount),
      ...normalized
    })
    const updates = updateReport
      ? await updateService!.record(siteId, health.checkIn.id, updateReport, health.checkIn.receivedAt)
      : null
    const connection = this.credentialService
      ? await this.credentialService.recordCheckIn(siteId, {
          contractVersion: reportedContractVersion,
          pluginVersion: normalized.pluginVersion,
          wordpressHomeUrl: normalized.wordpressHomeUrl
        }, health.checkIn.receivedAt)
      : null
    return {
      ...health,
      updates,
      acceptedActivityIds: updates?.acceptedActivityIds ?? [],
      connection: connection
        ? {
            contractVersion: connection.connection.contractVersion,
            rotation: connection.rotation
          }
        : null
    }
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
