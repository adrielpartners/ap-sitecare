import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import Database from 'better-sqlite3'

let database: Database.Database | undefined

export function useDatabase(): Database.Database {
  if (database) {
    return database
  }

  const config = useRuntimeConfig()
  const databasePath = resolve(config.databasePath)

  mkdirSync(dirname(databasePath), { recursive: true })

  database = new Database(databasePath)
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')

  return database
}
