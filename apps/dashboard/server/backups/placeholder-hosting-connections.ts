import type { HostingConnection, HostingConnectionType } from '../domain/types'
import type { HostingConnectionAdapter, HostingConnectionAssessment } from './hosting-connection'

export class PlaceholderHostingConnection implements HostingConnectionAdapter {
  constructor(
    readonly type: HostingConnectionType,
    private readonly fileAccess: boolean,
    private readonly databaseAccess: boolean,
    private readonly label: string
  ) {}

  assess(connection: HostingConnection): HostingConnectionAssessment {
    return {
      type: this.type,
      implemented: false,
      backupFiles: false,
      backupDatabase: false,
      restoreFiles: false,
      restoreDatabase: false,
      restoreCapability: 'unsupported',
      messages: [
        `${this.label} is modeled but its execution adapter is not implemented yet.`,
        this.fileAccess || (this.databaseAccess && connection.databaseConfigured)
          ? 'Configured access has not been verified by an implemented adapter.'
          : 'No usable backup access is currently recorded.'
      ]
    }
  }
}
