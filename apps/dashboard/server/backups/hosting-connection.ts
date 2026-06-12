import type { HostingConnection, HostingConnectionType, RestoreCapability } from '../domain/types'

export interface HostingConnectionAssessment {
  type: HostingConnectionType
  implemented: boolean
  backupFiles: boolean
  backupDatabase: boolean
  restoreFiles: boolean
  restoreDatabase: boolean
  restoreCapability: RestoreCapability
  messages: string[]
}

export interface HostingConnectionAdapter {
  readonly type: HostingConnectionType
  assess(connection: HostingConnection): HostingConnectionAssessment
}

export function calculateRestoreCapability(
  backupFiles: boolean,
  backupDatabase: boolean,
  restoreFiles: boolean,
  restoreDatabase: boolean
): RestoreCapability {
  if (restoreFiles && restoreDatabase) return 'full'
  if (restoreFiles || restoreDatabase) return 'partial'
  if (backupFiles || backupDatabase) return 'backup-only'
  return 'unsupported'
}
