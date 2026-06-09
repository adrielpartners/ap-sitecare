import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { runMigrations } from '../database/migrations'

let database: Database.Database | undefined

export function createDatabase(databasePath: string): Database.Database {
  const resolvedPath = databasePath === ':memory:' ? databasePath : resolve(databasePath)

  if (resolvedPath !== ':memory:') {
    mkdirSync(dirname(resolvedPath), { recursive: true })
  }

  const connection = new Database(resolvedPath)
  connection.pragma('journal_mode = WAL')
  connection.pragma('foreign_keys = ON')
  runMigrations(connection)

  return connection
}

export function useDatabase(): Database.Database {
  if (database) {
    return database
  }

  const config = useRuntimeConfig()
  database = createDatabase(config.databasePath)

  return database
}
