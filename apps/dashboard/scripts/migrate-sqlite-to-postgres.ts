import { migrateSqliteToPostgres } from '../server/database/sqlite-to-postgres'
import { createDatabase } from '../server/utils/database'

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const sourcePath = argument('--source') ?? process.env.SQLITE_SOURCE_PATH
const databaseUrl = argument('--target') ?? process.env.NUXT_DATABASE_URL

if (!sourcePath || !databaseUrl) {
  console.error(
    'Usage: npm run migrate:sqlite-to-postgres -- --source /path/sitecare.sqlite --target postgresql://user:password@host/database'
  )
  process.exitCode = 1
} else {
  const database = createDatabase(databaseUrl, {
    applicationName: 'ap-sitecare-sqlite-migration',
    maxConnections: 2
  })

  try {
    const result = await migrateSqliteToPostgres({ sourcePath, targetDatabase: database })
    console.log(`Migrated and verified ${result.rowsMigrated} rows across ${Object.keys(result.tableCounts).length} tables.`)
    console.log(`Rollback copy: ${result.backupPath}`)
  } finally {
    await database.close()
  }
}
