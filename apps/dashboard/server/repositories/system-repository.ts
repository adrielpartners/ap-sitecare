import { useDatabase } from '../utils/database'

export async function checkDatabaseConnection(): Promise<void> {
  await useDatabase().query('SELECT 1')
}
