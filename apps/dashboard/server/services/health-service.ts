import { checkDatabaseConnection } from '../repositories/system-repository'

export interface SystemHealth {
  database: 'connected'
  service: 'ap-sitecare-dashboard'
}

export function getSystemHealth(): SystemHealth {
  checkDatabaseConnection()

  return {
    database: 'connected',
    service: 'ap-sitecare-dashboard'
  }
}
