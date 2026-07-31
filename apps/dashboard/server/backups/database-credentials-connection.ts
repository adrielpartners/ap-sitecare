import type { HostingConnection } from '../domain/types'
import type { HostingConnectionAdapter, HostingConnectionAssessment } from './hosting-connection'
import { calculateRestoreCapability } from './hosting-connection'

export class DatabaseCredentialsConnection implements HostingConnectionAdapter {
  readonly type = 'database-credentials' as const

  assess(connection: HostingConnection): HostingConnectionAssessment {
    const ready = connection.databaseConfigured && connection.connectionStatus === 'ready'
    return {
      type: this.type,
      implemented: true,
      backupFiles: false,
      backupDatabase: ready,
      restoreFiles: false,
      restoreDatabase: ready,
      restoreCapability: calculateRestoreCapability(false, ready, false, ready),
      messages: ready
        ? ['Transitional direct database backup is available. Configure Hostinger SSH/SFTP for the required full files-and-database package.']
        : ['Direct database credentials have not been verified. Hostinger SSH/SFTP is preferred.']
    }
  }
}
