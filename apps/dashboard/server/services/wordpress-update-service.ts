import { randomUUID } from 'node:crypto'
import type {
  WordPressComponentType,
  WordPressUpdateActivity,
  WordPressUpdateInventoryItem,
  WordPressUpdateSnapshot
} from '../domain/types'
import { WordPressUpdateRepository } from '../repositories/wordpress-update-repository'
import { AuditService } from './audit-service'
import { SiteService } from './site-service'

const componentTypes = ['core', 'plugin', 'theme'] as const
const supportStatuses = ['supported', 'possibly-abandoned', 'unknown'] as const
const licenseStatuses = ['active', 'inactive', 'unknown', 'not-applicable'] as const
const outcomes = ['succeeded', 'failed', 'observed'] as const
const sources = ['wordpress-upgrader', 'wordpress-automatic-updater', 'inventory-reconciliation'] as const

export interface NormalizedWordPressUpdateReport {
  snapshot: Omit<WordPressUpdateSnapshot, 'id' | 'siteId' | 'checkInId' | 'receivedAt'>
  inventory: Array<Omit<WordPressUpdateInventoryItem, 'snapshotId' | 'siteId'>>
  activities: Array<Omit<WordPressUpdateActivity, 'id' | 'siteId' | 'recordedAt'>>
}

export class WordPressUpdateService {
  constructor(
    private readonly repository = new WordPressUpdateRepository(),
    private readonly siteService = new SiteService(),
    private readonly auditService = new AuditService()
  ) {}

  normalize(payload: Record<string, unknown>, contractVersion: number): NormalizedWordPressUpdateReport | null {
    if (contractVersion < 2) return null
    const updateInventory = requiredRecord(payload.updateInventory, 'updateInventory')
    const core = this.normalizeItem(requiredRecord(updateInventory.core, 'updateInventory.core'), 'core')
    const plugins = this.normalizeItems(updateInventory.plugins, 'plugin', 500)
    const themes = this.normalizeItems(updateInventory.themes, 'theme', 100)
    const inventory = [core, ...plugins, ...themes]
    const pendingUpdateCount = inventory.filter(item => item.availableVersion && item.availableVersion !== item.installedVersion).length
    return {
      snapshot: {
        contractVersion,
        checkedAt: requiredDate(updateInventory.checkedAt, 'updateInventory.checkedAt'),
        coreInstalledVersion: core.installedVersion,
        coreAvailableVersion: core.availableVersion,
        pluginCount: plugins.length,
        themeCount: themes.length,
        pendingUpdateCount
      },
      inventory,
      activities: this.normalizeActivities(payload.updateActivities)
    }
  }

  async record(
    siteId: string,
    checkInId: string,
    report: NormalizedWordPressUpdateReport,
    receivedAt = new Date().toISOString()
  ): Promise<{ snapshot: WordPressUpdateSnapshot, acceptedActivityIds: string[] }> {
    await this.siteService.get(siteId)
    const snapshotId = randomUUID()
    const snapshot: WordPressUpdateSnapshot = {
      id: snapshotId,
      siteId,
      checkInId,
      receivedAt,
      ...report.snapshot
    }
    const inventory = report.inventory.map(item => ({ ...item, snapshotId, siteId }))
    const activities = report.activities.map(activity => ({
      ...activity,
      id: randomUUID(),
      siteId,
      recordedAt: receivedAt
    }))
    const acceptedActivityIds = await this.repository.record(snapshot, inventory, activities)
    if (activities.length > 0) {
      await this.auditService.record({
        siteId,
        actorType: 'wordpress-plugin',
        eventType: 'wordpress.update-activity-received',
        metadata: {
          activityCount: activities.length,
          failedCount: activities.filter(activity => activity.outcome === 'failed').length,
          snapshotId
        }
      })
    }
    return { snapshot, acceptedActivityIds }
  }

  async getSiteDetail(siteId: string): Promise<{
    snapshot: WordPressUpdateSnapshot | null
    inventory: WordPressUpdateInventoryItem[]
    activities: WordPressUpdateActivity[]
    stale: boolean
  }> {
    await this.siteService.get(siteId)
    const snapshot = await this.repository.findLatestSnapshot(siteId)
    return {
      snapshot,
      inventory: snapshot ? await this.repository.listInventory(snapshot.id) : [],
      activities: await this.repository.listActivities(siteId),
      stale: snapshot ? Date.now() - Date.parse(snapshot.checkedAt) > 12 * 60 * 60 * 1000 : true
    }
  }

  async listPortfolio(siteIds: string[] | null = null) {
    return (await this.repository.listPortfolio(siteIds)).map(entry => ({
      ...entry,
      status: Date.now() - Date.parse(entry.snapshot.checkedAt) > 12 * 60 * 60 * 1000
        ? 'stale' as const
        : entry.snapshot.pendingUpdateCount > 0 ? 'pending' as const : 'current' as const
    }))
  }

  private normalizeItems(value: unknown, type: WordPressComponentType, maximum: number) {
    if (!Array.isArray(value)) throw new Error(`updateInventory.${type}s must be an array.`)
    if (value.length > maximum) throw new Error(`updateInventory.${type}s exceeds the ${maximum}-item limit.`)
    return value.map((item, index) => this.normalizeItem(
      requiredRecord(item, `updateInventory.${type}s[${index}]`),
      type
    ))
  }

  private normalizeItem(value: Record<string, unknown>, type: WordPressComponentType) {
    const metadata: Record<string, unknown> = {}
    for (const key of ['pluginFile', 'updateUri', 'lastUpdatedAt', 'stylesheet', 'requiresWordPress', 'requiresPhp']) {
      const item = value[key]
      if (typeof item === 'string' && item.length <= 500) metadata[key] = item
    }
    return {
      componentType: type,
      slug: requiredText(value.slug, `${type}.slug`, 300),
      name: requiredText(value.name, `${type}.name`, 300),
      installedVersion: requiredText(value.installedVersion, `${type}.installedVersion`, 100),
      availableVersion: optionalText(value.availableVersion, `${type}.availableVersion`, 100),
      active: optionalBoolean(value.active, type === 'core'),
      autoUpdateEnabled: optionalBoolean(value.autoUpdateEnabled, false),
      supportStatus: allowedValue(value.supportStatus, supportStatuses, 'unknown'),
      premiumLicenseStatus: allowedValue(value.premiumLicenseStatus, licenseStatuses, type === 'core' ? 'not-applicable' : 'unknown'),
      metadata
    }
  }

  private normalizeActivities(value: unknown): NormalizedWordPressUpdateReport['activities'] {
    if (value === undefined || value === null) return []
    if (!Array.isArray(value)) throw new Error('updateActivities must be an array.')
    if (value.length > 200) throw new Error('updateActivities exceeds the 200-item limit.')
    return value.map((item, index) => {
      const activity = requiredRecord(item, `updateActivities[${index}]`)
      return {
        sourceEventId: requiredText(activity.id, `updateActivities[${index}].id`, 100),
        componentType: allowedRequiredValue(activity.componentType, componentTypes, `updateActivities[${index}].componentType`),
        slug: requiredText(activity.slug, `updateActivities[${index}].slug`, 300),
        name: requiredText(activity.name, `updateActivities[${index}].name`, 300),
        priorVersion: optionalText(activity.priorVersion, `updateActivities[${index}].priorVersion`, 100),
        targetVersion: optionalText(activity.targetVersion, `updateActivities[${index}].targetVersion`, 100),
        resultingVersion: optionalText(activity.resultingVersion, `updateActivities[${index}].resultingVersion`, 100),
        startedAt: optionalDate(activity.startedAt, `updateActivities[${index}].startedAt`),
        completedAt: requiredDate(activity.completedAt, `updateActivities[${index}].completedAt`),
        outcome: allowedRequiredValue(activity.outcome, outcomes, `updateActivities[${index}].outcome`),
        errorCode: optionalText(activity.errorCode, `updateActivities[${index}].errorCode`, 200),
        errorMessage: optionalText(activity.errorMessage, `updateActivities[${index}].errorMessage`, 1_000),
        source: allowedRequiredValue(activity.source, sources, `updateActivities[${index}].source`)
      }
    })
  }
}

function requiredRecord(value: unknown, key: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${key} must be an object.`)
  return value as Record<string, unknown>
}

function requiredText(value: unknown, key: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${key} is required.`)
  const normalized = value.trim()
  if (normalized.length > maximum) throw new Error(`${key} is too long.`)
  return normalized
}

function optionalText(value: unknown, key: string, maximum: number): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') throw new Error(`${key} must be a string or null.`)
  const normalized = value.trim()
  if (normalized.length > maximum) throw new Error(`${key} is too long.`)
  return normalized || null
}

function optionalBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function requiredDate(value: unknown, key: string): string {
  const text = requiredText(value, key, 100)
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${key} must be an ISO 8601 timestamp.`)
  return new Date(text).toISOString()
}

function optionalDate(value: unknown, key: string): string | null {
  if (value === null || value === undefined || value === '') return null
  return requiredDate(value, key)
}

function allowedValue<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
  fallback: Values[number]
): Values[number] {
  return typeof value === 'string' && values.includes(value) ? value as Values[number] : fallback
}

function allowedRequiredValue<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
  key: string
): Values[number] {
  if (typeof value !== 'string' || !values.includes(value)) throw new Error(`${key} is not supported.`)
  return value as Values[number]
}
