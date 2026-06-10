import { calculateSnapshotStatus, HealthService } from './health-service'

interface PluginCheckInPayload {
  wordpressVersion: string | null
  phpVersion: string | null
  pluginUpdateCount: number
  themeUpdateCount: number
  lastCronRunAt: string | null
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
  constructor(private readonly healthService = new HealthService()) {}

  testConnection(siteId: string): { connected: true, siteId: string } {
    return { connected: true, siteId }
  }

  recordCheckIn(siteId: string, requestTimestamp: string, payload: Record<string, unknown>) {
    const normalized: PluginCheckInPayload = {
      wordpressVersion: optionalString(payload.wordpressVersion, 'wordpressVersion'),
      phpVersion: optionalString(payload.phpVersion, 'phpVersion'),
      pluginUpdateCount: updateCount(payload.pluginUpdateCount, 'pluginUpdateCount'),
      themeUpdateCount: updateCount(payload.themeUpdateCount, 'themeUpdateCount'),
      lastCronRunAt: optionalString(payload.lastCronRunAt, 'lastCronRunAt')
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
}
