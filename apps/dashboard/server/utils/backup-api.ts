import type { H3Event } from 'h3'
import type {
  BackupFrequency,
  HostingConnectionType,
  StorageProviderType
} from '../domain/types'

export function backupApiError(event: H3Event, error: unknown) {
  const message = error instanceof Error ? error.message : 'The backup request could not be completed.'
  const statusCode = message.includes('not found') ? 404 : 400
  setResponseStatus(event, statusCode)
  return { ok: false, error: { code: backupErrorCode(message), message } }
}

export function parseBackupPolicyBody(body: Record<string, unknown>) {
  return {
    enabled: requiredBoolean(body, 'enabled'),
    frequency: requiredString(body, 'frequency') as BackupFrequency,
    filesEnabled: requiredBoolean(body, 'filesEnabled'),
    databaseEnabled: requiredBoolean(body, 'databaseEnabled'),
    storageProvider: requiredString(body, 'storageProvider') as StorageProviderType,
    keepDaily: requiredNumber(body, 'keepDaily'),
    keepWeekly: requiredNumber(body, 'keepWeekly'),
    keepMonthly: requiredNumber(body, 'keepMonthly'),
    autoDeleteExpired: requiredBoolean(body, 'autoDeleteExpired'),
    restoreEnabled: requiredBoolean(body, 'restoreEnabled'),
    restoreRequiresConfirmation: true,
    notes: optionalString(body, 'notes'),
    connectionType: requiredString(body, 'connectionType') as HostingConnectionType,
    localPath: optionalString(body, 'localPath'),
    databaseConfigured: requiredBoolean(body, 'databaseConfigured'),
    databaseHost: optionalString(body, 'databaseHost'),
    databasePort: optionalNumber(body, 'databasePort'),
    databaseName: optionalString(body, 'databaseName'),
    databaseUsername: optionalString(body, 'databaseUsername'),
    databasePassword: optionalString(body, 'databasePassword'),
    providerLabel: optionalString(body, 'providerLabel'),
    connectionNotes: optionalString(body, 'connectionNotes')
  }
}

function requiredBoolean(body: Record<string, unknown>, key: string): boolean {
  if (typeof body[key] !== 'boolean') throw new Error(`${key} must be true or false.`)
  return body[key]
}

function requiredString(body: Record<string, unknown>, key: string): string {
  if (typeof body[key] !== 'string' || !body[key].trim()) throw new Error(`${key} is required.`)
  return body[key]
}

function requiredNumber(body: Record<string, unknown>, key: string): number {
  if (typeof body[key] !== 'number' || !Number.isFinite(body[key])) throw new Error(`${key} must be a number.`)
  return body[key]
}

function optionalString(body: Record<string, unknown>, key: string): string | null {
  const value = body[key]
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw new Error(`${key} must be a string.`)
  return value
}

function optionalNumber(body: Record<string, unknown>, key: string): number | null {
  const value = body[key]
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${key} must be a valid port number.`)
  }
  return value
}

function backupErrorCode(message: string): string {
  if (message.includes('not found')) return 'NOT_FOUND'
  if (message.includes('not implemented')) return 'NOT_IMPLEMENTED'
  if (message.includes('outside') || message.includes('path')) return 'PATH_NOT_ALLOWED'
  if (message.includes('configured')) return 'NOT_CONFIGURED'
  return 'INVALID_BACKUP_REQUEST'
}
