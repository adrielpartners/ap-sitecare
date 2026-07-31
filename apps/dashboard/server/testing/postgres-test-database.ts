import { randomUUID } from 'node:crypto'
import { createDatabase, type PostgresDatabase } from '../utils/database'

const defaultTestDatabaseUrl = 'postgresql://sitecare:sitecare@127.0.0.1:54329/sitecare_test'

export async function createTestDatabase(): Promise<PostgresDatabase> {
  const schema = `test_${randomUUID().replaceAll('-', '')}`
  const database = createDatabase(process.env.TEST_DATABASE_URL ?? defaultTestDatabaseUrl, {
    applicationName: 'ap-sitecare-tests',
    maxConnections: 2,
    schema
  })
  await database.ready()
  return database
}

export async function destroyTestDatabase(database: PostgresDatabase): Promise<void> {
  try {
    await database.dropSchema()
  } finally {
    await database.close()
  }
}
