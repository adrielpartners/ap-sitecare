import { useDatabase } from '../utils/database'

export function checkDatabaseConnection(): void {
  useDatabase().prepare('SELECT 1').get()
}

